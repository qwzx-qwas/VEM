#!/usr/bin/env node
import { appendFile, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function parseArgs(argv) {
  const result = { iterations: 10, timeoutMs: 3000, base: os.tmpdir() };
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === '--iterations') result.iterations = Number(value);
    else if (key === '--timeout-ms') result.timeoutMs = Number(value);
    else if (key === '--base') result.base = value;
    else throw new Error(`unknown argument: ${key}`);
  }
  if (!Number.isInteger(result.iterations) || result.iterations < 3 || result.iterations > 50) {
    throw new Error('iterations must be an integer from 3 through 50');
  }
  if (!Number.isInteger(result.timeoutMs) || result.timeoutMs < 100 || result.timeoutMs > 10000) {
    throw new Error('timeout-ms must be an integer from 100 through 10000');
  }
  return result;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.max(0, Math.ceil(fraction * sorted.length) - 1);
  return Number(sorted[rank].toFixed(3));
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await mkdir(options.base, { recursive: true });
  const directory = await mkdtemp(path.join(options.base, 'vem-watch-'));
  let watcher;
  let cleaned = false;
  const samples = { create: [], modify: [], rename: [] };
  const waiters = new Set();

  try {
    for (let index = 0; index < options.iterations; index += 1) {
      await writeFile(path.join(directory, `modify-${index}.txt`), 'before\n');
      await writeFile(path.join(directory, `rename-${index}-source.txt`), 'before\n');
    }

    watcher = watch(directory, { persistent: true, recursive: false }, (eventType, filename) => {
      const observedAt = process.hrtime.bigint();
      const name = filename?.toString() ?? '';
      for (const waiter of [...waiters]) {
        if (waiter.predicate(eventType, name)) {
          waiters.delete(waiter);
          clearTimeout(waiter.timer);
          const elapsedMs = Number(observedAt - waiter.startedAt) / 1_000_000;
          waiter.resolve(elapsedMs);
        }
      }
    });

    const observe = (predicate, operation) => new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        reject,
        startedAt: process.hrtime.bigint(),
        timer: undefined,
      };
      waiter.timer = setTimeout(() => {
        waiters.delete(waiter);
        reject(new Error('watch-timeout'));
      }, options.timeoutMs);
      waiters.add(waiter);
      Promise.resolve()
        .then(operation)
        .catch((error) => {
          waiters.delete(waiter);
          clearTimeout(waiter.timer);
          reject(error);
        });
    });

    await sleep(50);
    for (let index = 0; index < options.iterations; index += 1) {
      const createName = `create-${index}.txt`;
      samples.create.push(await observe(
        (_eventType, filename) => filename === createName,
        () => writeFile(path.join(directory, createName), 'created\n'),
      ));
      await sleep(10);

      const modifyName = `modify-${index}.txt`;
      samples.modify.push(await observe(
        (_eventType, filename) => filename === modifyName,
        () => appendFile(path.join(directory, modifyName), 'after\n'),
      ));
      await sleep(10);

      const renameSource = `rename-${index}-source.txt`;
      const renameTarget = `rename-${index}-target.txt`;
      samples.rename.push(await observe(
        (eventType, filename) => eventType === 'rename' && (filename === renameSource || filename === renameTarget),
        () => rename(path.join(directory, renameSource), path.join(directory, renameTarget)),
      ));
      await sleep(10);
    }

    const combined = [...samples.create, ...samples.modify, ...samples.rename];
    const result = {
      schemaVersion: 'P0-T0B-watch-v1',
      provider: 'node:fs.watch',
      polling: false,
      iterations: options.iterations,
      timeoutMs: options.timeoutMs,
      samplesMs: Object.fromEntries(
        Object.entries(samples).map(([name, values]) => [name, values.map((value) => Number(value.toFixed(3)))]),
      ),
      p50Ms: percentile(combined, 0.5),
      p95Ms: percentile(combined, 0.95),
      eventCount: combined.length,
      result: 'pass',
    };
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    if (watcher) watcher.close();
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('watcher-closed'));
    }
    waiters.clear();
    await rm(directory, { recursive: true, force: true });
    cleaned = true;
    if (!cleaned) process.exitCode = 3;
  }
}

main().catch((error) => {
  process.stderr.write(`WATCH_PROBE_ERROR=${error.name}:${error.message}\n`);
  process.exitCode = 2;
});
