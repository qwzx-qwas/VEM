#!/usr/bin/env node

import { createHash } from "node:crypto";
import { watch, readFileSync } from "node:fs";
import { createServer } from "node:http";

const MAX_HEADER_BYTES = 16 * 1024;
const GENERATION_RE = /^generation-[12]-[a-f0-9]{12}$/;
const UPDATE_RE = /^update-[12]-[a-f0-9]{12}$/;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || value === undefined || values.has(name)) {
      fail("invalid arguments");
    }
    values.set(name, value);
  }
  const allowed = new Set(["--port", "--generation", "--watch-file", "--timeout-ms"]);
  if (values.size !== allowed.size || [...values.keys()].some((key) => !allowed.has(key))) {
    fail("arguments must match the closed allowlist");
  }
  const port = Number(values.get("--port"));
  const timeoutMs = Number(values.get("--timeout-ms"));
  const generation = values.get("--generation");
  const watchFile = values.get("--watch-file");
  if (!Number.isInteger(port) || port < 0 || port > 65535) fail("invalid port");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) fail("invalid timeout");
  if (!GENERATION_RE.test(generation)) fail("invalid generation");
  if (!watchFile?.startsWith("/")) fail("watch file must be absolute");
  return { port, timeoutMs, generation, watchFile };
}

function emit(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function websocketTextFrame(text) {
  const payload = Buffer.from(text, "utf8");
  if (payload.length > 125) throw new Error("frame payload exceeds minimal lane");
  return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
}

function fixtureHtml(generation) {
  const encoded = JSON.stringify(generation);
  return `<!doctype html><html><body><main id="status">waiting</main><script>
const expectedGeneration=${encoded};
const socket=new WebSocket("ws://"+location.host+"/__vem/hmr?generation="+encodeURIComponent(expectedGeneration));
socket.onmessage=async(event)=>{
  let message;
  try{message=JSON.parse(event.data);}catch{return;}
  if(message.kind!=="hmr-update"||message.generation!==expectedGeneration||!/^update-[12]-[a-f0-9]{12}$/.test(message.update)){return;}
  document.getElementById("status").textContent="VEM_NETWORK_PREFLIGHT_OK:"+message.generation+":"+message.update;
  await fetch("/__vem/ack?generation="+encodeURIComponent(message.generation)+"&update="+encodeURIComponent(message.update),{cache:"no-store"});
};
</script>`;
}

const args = parseArgs(process.argv.slice(2));
const sockets = new Set();
const pages = new Set();
let currentUpdate = null;
let acknowledged = false;
let stopping = false;

function closePages() {
  for (const response of pages) {
    if (!response.writableEnded) response.end("</body></html>");
  }
  pages.clear();
}

const server = createServer({ maxHeaderSize: MAX_HEADER_BYTES }, (request, response) => {
  let url;
  try {
    url = new URL(request.url, `http://localhost:${server.address()?.port ?? 0}`);
  } catch {
    response.writeHead(400).end();
    return;
  }
  if (request.method === "GET" && url.pathname === "/" && url.searchParams.size === 0) {
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff",
    });
    response.write(fixtureHtml(args.generation));
    pages.add(response);
    response.on("close", () => pages.delete(response));
    return;
  }
  if (request.method === "GET" && url.pathname === "/__vem/ack") {
    const generation = url.searchParams.get("generation");
    const update = url.searchParams.get("update");
    if (url.searchParams.size !== 2 || generation !== args.generation || update !== currentUpdate || !UPDATE_RE.test(update ?? "")) {
      response.writeHead(400).end();
      return;
    }
    acknowledged = true;
    response.writeHead(204, { "cache-control": "no-store" }).end();
    emit({ event: "ack", generation: args.generation, update });
    setTimeout(closePages, 50);
    return;
  }
  response.writeHead(404).end();
});

server.on("upgrade", (request, socket) => {
  let url;
  try {
    url = new URL(request.url, `http://localhost:${server.address()?.port ?? 0}`);
  } catch {
    socket.destroy();
    return;
  }
  const expectedOrigin = `http://localhost:${server.address().port}`;
  const key = request.headers["sec-websocket-key"];
  const version = request.headers["sec-websocket-version"];
  const valid = request.method === "GET"
    && url.pathname === "/__vem/hmr"
    && url.searchParams.size === 1
    && url.searchParams.get("generation") === args.generation
    && request.headers.origin === expectedOrigin
    && request.headers.upgrade?.toLowerCase() === "websocket"
    && request.headers.connection?.toLowerCase().split(/\s*,\s*/).includes("upgrade")
    && version === "13"
    && typeof key === "string"
    && /^[A-Za-z0-9+/]{22}==$/.test(key);
  if (!valid) {
    socket.write("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  const accept = createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "\r\n",
  ].join("\r\n"));
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
  socket.on("error", () => sockets.delete(socket));
  socket.on("data", () => {});
  emit({ event: "websocket", generation: args.generation });
});

function publishWatchedValue() {
  let value;
  try {
    value = readFileSync(args.watchFile, "utf8").trim();
  } catch {
    return;
  }
  if (!UPDATE_RE.test(value) || value === currentUpdate) return;
  currentUpdate = value;
  const message = JSON.stringify({ kind: "hmr-update", generation: args.generation, update: value });
  const frame = websocketTextFrame(message);
  for (const socket of sockets) {
    if (!socket.destroyed) socket.write(frame);
  }
  emit({ event: "watch", generation: args.generation, update: value, websocketCount: sockets.size });
}

const watcher = watch(args.watchFile, { persistent: true }, publishWatchedValue);
watcher.on("error", () => shutdown("watch-error", 2));

function shutdown(reason, exitCode = acknowledged ? 0 : 2) {
  if (stopping) return;
  stopping = true;
  clearTimeout(hardTimeout);
  watcher.close();
  closePages();
  for (const socket of sockets) socket.destroy();
  server.close(() => {
    emit({ event: "shutdown", generation: args.generation, reason });
    process.exit(exitCode);
  });
  setTimeout(() => process.exit(2), 1000).unref();
}

process.on("SIGTERM", () => shutdown("sigterm"));
process.on("SIGINT", () => shutdown("sigint"));
server.on("error", (error) => {
  emit({ event: "server-error", generation: args.generation, code: error.code ?? "unknown" });
  process.exit(2);
});

server.listen({ host: "127.0.0.1", port: args.port, exclusive: true }, () => {
  emit({ event: "ready", generation: args.generation, port: server.address().port, pid: process.pid });
});

const hardTimeout = setTimeout(() => shutdown("hard-timeout", 2), args.timeoutMs);
