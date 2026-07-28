#!/usr/bin/env python3
"""P0-T0D Windows Edge to WSL HTTP/WebSocket/watch/restart probe."""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field
from datetime import datetime
import ipaddress
import json
import os
from pathlib import Path
import pwd
import queue
import shutil
import signal
import socket
import subprocess
import tempfile
import threading
import time
from typing import Any
import uuid

import edge_probe
import preflight

TASK_ID = "P0-T0D"
PROFILE_SCHEMA = "P0-T0D-network-profile-v1"
NODE_VERSION = "24.18.0"
PNPM_VERSION = "10.34.0"
GENERATION_PREFIX = "generation-"
UPDATE_PREFIX = "update-"
SERVER_PATH = "scripts/preflight/network_server.mjs"
RESULTS = {"pass", "fail", "blocked", "not-run"}


class NetworkProbeError(ValueError):
    """A machine-classified preflight boundary failure."""

    def __init__(self, classification: str):
        super().__init__(classification)
        self.classification = classification


def exact_keys(value: Any, expected: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != expected:
        raise NetworkProbeError(f"{label}-keys-invalid")
    return value


def bounded_string(value: Any, label: str, maximum: int = 256) -> str:
    if not isinstance(value, str) or not value or len(value) > maximum:
        raise NetworkProbeError(f"{label}-invalid")
    return value


def bounded_int(value: Any, label: str, low: int = 0, high: int = 2**31 - 1) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or not low <= value <= high:
        raise NetworkProbeError(f"{label}-invalid")
    return value


def derive_overall(profile: dict[str, Any]) -> str:
    values = [profile["edge"]["result"], *[item["result"] for item in profile["generations"]], profile["cleanup"]["result"]]
    derived = preflight.derive_overall(values)
    return "blocked" if derived == "partial" else derived


def validate_generation(item: dict[str, Any], ordinal: int) -> None:
    exact_keys(item, {
        "ordinal", "generation", "update", "serverPid", "edgePid", "edgeProcessCount", "port",
        "serverReady", "windowsPortOpen", "nonLoopbackRefused", "websocketConnected", "watchObserved",
        "ackObserved", "domSentinelObserved", "edgeExitCode", "serverExitCode", "portClosed",
        "profileRemoved", "result", "classification",
    }, f"generation-{ordinal}")
    if item["ordinal"] != ordinal:
        raise NetworkProbeError("generation-ordinal-invalid")
    generation = bounded_string(item["generation"], "generation")
    update = bounded_string(item["update"], "update")
    if not generation.startswith(f"{GENERATION_PREFIX}{ordinal}-") or not update.startswith(f"{UPDATE_PREFIX}{ordinal}-"):
        raise NetworkProbeError("generation-correlation-invalid")
    for name in ["serverPid", "edgePid"]:
        if item[name] is not None:
            bounded_int(item[name], name, 1)
    bounded_int(item["edgeProcessCount"], "edge-process-count", 0, 100)
    if item["port"] is not None:
        bounded_int(item["port"], "port", 1, 65535)
    for name in [
        "serverReady", "windowsPortOpen", "nonLoopbackRefused", "websocketConnected", "watchObserved",
        "ackObserved", "domSentinelObserved", "portClosed", "profileRemoved",
    ]:
        if not isinstance(item[name], bool):
            raise NetworkProbeError(f"generation-{name}-invalid")
    for name in ["edgeExitCode", "serverExitCode"]:
        if item[name] is not None:
            bounded_int(item[name], name, -255, 255)
    if item["result"] not in RESULTS:
        raise NetworkProbeError("generation-result-invalid")
    bounded_string(item["classification"], "generation-classification")
    passed = all(item[name] for name in [
        "serverReady", "windowsPortOpen", "nonLoopbackRefused", "websocketConnected", "watchObserved",
        "ackObserved", "domSentinelObserved", "portClosed", "profileRemoved",
    ]) and item["edgeExitCode"] == 0 and item["serverExitCode"] == 0
    if passed and (item["serverPid"] is None or item["edgePid"] is None or item["edgeProcessCount"] < 1 or item["port"] is None):
        passed = False
    if item["result"] == "pass" and not passed:
        raise NetworkProbeError("generation-pass-without-evidence")


def validate_profile(profile: dict[str, Any]) -> None:
    preflight._scan_for_secrets(profile)
    exact_keys(profile, {"schemaVersion", "taskId", "runId", "recordedAt", "edge", "generations", "cleanup", "overall"}, "profile")
    if profile["schemaVersion"] != PROFILE_SCHEMA or profile["taskId"] != TASK_ID:
        raise NetworkProbeError("profile-identity-invalid")
    if not isinstance(profile["runId"], str) or not preflight.RUN_ID_RE.fullmatch(profile["runId"]):
        raise NetworkProbeError("run-id-invalid")
    recorded = bounded_string(profile["recordedAt"], "recorded-at", 64)
    if datetime.fromisoformat(recorded).utcoffset() is None:
        raise NetworkProbeError("recorded-at-offset-missing")
    edge = exact_keys(profile["edge"], {"result", "classification", "location", "productVersion"}, "edge")
    if edge["result"] not in RESULTS:
        raise NetworkProbeError("edge-result-invalid")
    bounded_string(edge["classification"], "edge-classification")
    if edge["location"] not in {"program-files-x86", "program-files"}:
        raise NetworkProbeError("edge-location-invalid")
    bounded_string(edge["productVersion"], "edge-version", 64)
    generations = profile["generations"]
    if not isinstance(generations, list) or len(generations) != 2:
        raise NetworkProbeError("generation-count-invalid")
    for ordinal, item in enumerate(generations, 1):
        validate_generation(item, ordinal)
    if all(item["result"] == "pass" for item in generations):
        if generations[0]["generation"] == generations[1]["generation"]:
            raise NetworkProbeError("restart-generation-reused")
        if generations[0]["serverPid"] == generations[1]["serverPid"]:
            raise NetworkProbeError("restart-server-pid-reused")
        if generations[0]["port"] != generations[1]["port"]:
            raise NetworkProbeError("restart-port-not-reused")
    cleanup = exact_keys(profile["cleanup"], {"result", "classification", "serverResidue", "edgeResidue", "tempRemoved"}, "cleanup")
    if cleanup["result"] not in RESULTS:
        raise NetworkProbeError("cleanup-result-invalid")
    bounded_string(cleanup["classification"], "cleanup-classification")
    bounded_int(cleanup["serverResidue"], "server-residue", 0, 10)
    bounded_int(cleanup["edgeResidue"], "edge-residue", 0, 100)
    if not isinstance(cleanup["tempRemoved"], bool):
        raise NetworkProbeError("cleanup-temp-invalid")
    if cleanup["result"] == "pass" and (cleanup["serverResidue"] != 0 or cleanup["edgeResidue"] != 0 or not cleanup["tempRemoved"]):
        raise NetworkProbeError("cleanup-pass-with-residue")
    if profile["overall"] not in {"pass", "fail", "blocked"} or profile["overall"] != derive_overall(profile):
        raise NetworkProbeError("overall-mismatch")


@dataclass
class ServerHandle:
    process: subprocess.Popen[bytes]
    generation: str
    events: list[dict[str, Any]] = field(default_factory=list)
    lines: queue.Queue[bytes | None] = field(default_factory=queue.Queue)
    stderr_bytes: int = 0
    stdout_thread: threading.Thread = field(init=False)
    stderr_thread: threading.Thread = field(init=False)

    def __post_init__(self) -> None:
        self.stdout_thread = threading.Thread(target=self._read_stdout, daemon=True)
        self.stderr_thread = threading.Thread(target=self._drain_stderr, daemon=True)
        self.stdout_thread.start()
        self.stderr_thread.start()

    def _read_stdout(self) -> None:
        assert self.process.stdout is not None
        for line in self.process.stdout:
            self.lines.put(line)
        self.lines.put(None)

    def _drain_stderr(self) -> None:
        assert self.process.stderr is not None
        while chunk := self.process.stderr.read(4096):
            self.stderr_bytes = min(1_000_000, self.stderr_bytes + len(chunk))


def parse_server_event(raw: bytes, generation: str) -> dict[str, Any]:
    if len(raw) > 4096:
        raise NetworkProbeError("server-event-too-large")
    try:
        event = json.loads(raw.decode("utf-8"))
    except (UnicodeError, json.JSONDecodeError) as error:
        raise NetworkProbeError("server-event-invalid") from error
    if not isinstance(event, dict) or event.get("generation") != generation:
        raise NetworkProbeError("server-event-generation-invalid")
    allowed = {
        "ready": {"event", "generation", "port", "pid"},
        "websocket": {"event", "generation"},
        "watch": {"event", "generation", "update", "websocketCount"},
        "ack": {"event", "generation", "update"},
        "shutdown": {"event", "generation", "reason"},
        "server-error": {"event", "generation", "code"},
    }
    name = event.get("event")
    if name not in allowed or set(event) != allowed[name]:
        raise NetworkProbeError("server-event-shape-invalid")
    return event


def wait_server_event(handle: ServerHandle, name: str, timeout_seconds: float) -> dict[str, Any]:
    deadline = time.monotonic() + timeout_seconds
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise NetworkProbeError(f"{name}-timeout")
        try:
            raw = handle.lines.get(timeout=remaining)
        except queue.Empty as error:
            raise NetworkProbeError(f"{name}-timeout") from error
        if raw is None:
            raise NetworkProbeError(f"server-exited-before-{name}")
        event = parse_server_event(raw, handle.generation)
        handle.events.append(event)
        if event["event"] == "server-error":
            raise NetworkProbeError("server-listen-failed")
        if event["event"] == name:
            return event


def start_server(root: Path, watch_file: Path, generation: str, port: int, timeout_seconds: int) -> tuple[ServerHandle, dict[str, Any]]:
    process = subprocess.Popen(
        [
            "node", str(root / SERVER_PATH), "--port", str(port), "--generation", generation,
            "--watch-file", str(watch_file), "--timeout-ms", str(timeout_seconds * 1000),
        ],
        cwd=root,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=False,
        bufsize=0,
        start_new_session=True,
    )
    handle = ServerHandle(process, generation)
    event = wait_server_event(handle, "ready", 10)
    bounded_int(event["port"], "ready-port", 1, 65535)
    bounded_int(event["pid"], "ready-pid", 1)
    if event["pid"] != process.pid or (port and event["port"] != port):
        raise NetworkProbeError("server-ready-identity-invalid")
    return handle, event


def stop_server(handle: ServerHandle) -> int | None:
    if handle.process.poll() is None:
        try:
            os.killpg(handle.process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    try:
        exit_code = handle.process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(handle.process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        exit_code = handle.process.wait(timeout=5)
    handle.stdout_thread.join(timeout=2)
    handle.stderr_thread.join(timeout=2)
    if handle.process.stdout is not None:
        handle.process.stdout.close()
    if handle.process.stderr is not None:
        handle.process.stderr.close()
    return exit_code


def powershell_json(command_text: str, timeout_seconds: int = 10) -> dict[str, Any]:
    try:
        completed = subprocess.run(
            ["powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command_text],
            check=False,
            capture_output=True,
            text=False,
            timeout=timeout_seconds,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as error:
        raise NetworkProbeError("windows-interop-unavailable") from error
    if completed.returncode != 0 or len(completed.stdout) > 100_000:
        raise NetworkProbeError("windows-interop-nonzero")
    try:
        value = json.loads(edge_probe.decode_adapter_stdout(completed.stdout).strip().lstrip("\ufeff"))
    except (UnicodeError, json.JSONDecodeError) as error:
        raise NetworkProbeError("windows-interop-output-invalid") from error
    if not isinstance(value, dict):
        raise NetworkProbeError("windows-interop-output-invalid")
    return value


def windows_port_connected(port: int) -> bool:
    command = rf"""
$connected = $false
$client = [System.Net.Sockets.TcpClient]::new()
try {{
  $operation = $client.ConnectAsync("localhost", {port})
  if ($operation.Wait(2000)) {{ $connected = $client.Connected }}
}} catch {{ $connected = $false }} finally {{ $client.Dispose() }}
[ordered]@{{ connected = [bool]$connected }} | ConvertTo-Json -Compress
"""
    value = powershell_json(command, 7)
    exact_keys(value, {"connected"}, "windows-port")
    if not isinstance(value["connected"], bool):
        raise NetworkProbeError("windows-port-output-invalid")
    return value["connected"]


def owned_edge_process(marker: str) -> tuple[int, int | None]:
    command = rf"""
$owned = @(Get-CimInstance Win32_Process | Where-Object {{ $_.Name -eq "msedge.exe" -and $null -ne $_.CommandLine -and $_.CommandLine.Contains("{marker}") }})
$selected = if ($owned.Count -gt 0) {{ [int]$owned[0].ProcessId }} else {{ $null }}
[ordered]@{{ count = $owned.Count; pid = $selected }} | ConvertTo-Json -Compress
"""
    value = powershell_json(command, 10)
    exact_keys(value, {"count", "pid"}, "owned-edge")
    count = bounded_int(value["count"], "owned-edge-count", 0, 100)
    pid = value["pid"]
    if pid is not None:
        pid = bounded_int(pid, "owned-edge-pid", 1)
    return count, pid


def non_loopback_ipv4() -> str:
    try:
        completed = subprocess.run(["hostname", "-I"], check=False, capture_output=True, text=True, timeout=5)
    except (FileNotFoundError, subprocess.TimeoutExpired) as error:
        raise NetworkProbeError("non-loopback-address-unavailable") from error
    for text in completed.stdout.split():
        try:
            address = ipaddress.ip_address(text)
        except ValueError:
            continue
        if address.version == 4 and not address.is_loopback:
            return text
    raise NetworkProbeError("non-loopback-address-unavailable")


def non_loopback_refused(address: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as client:
        client.settimeout(1)
        return client.connect_ex((address, port)) != 0


def process_exists(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def windows_path(path: Path, root: Path) -> str:
    try:
        completed = subprocess.run(
            ["wslpath", "-w", str(path)], cwd=root, check=False, capture_output=True, text=True, timeout=10,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as error:
        raise NetworkProbeError("windows-path-conversion-failed") from error
    value = completed.stdout.strip()
    if completed.returncode != 0 or not value:
        raise NetworkProbeError("windows-path-conversion-failed")
    return value


def command_record(command_id: str, argv: list[str], result: str, classification: str, exit_code: int | None) -> dict[str, Any]:
    return {
        "id": command_id,
        "argv": argv,
        "exitCode": exit_code,
        "result": result,
        "stdoutSummary": classification,
        "stderrSummary": None,
    }


def blank_generation(ordinal: int, generation: str, update: str) -> dict[str, Any]:
    return {
        "ordinal": ordinal,
        "generation": generation,
        "update": update,
        "serverPid": None,
        "edgePid": None,
        "edgeProcessCount": 0,
        "port": None,
        "serverReady": False,
        "windowsPortOpen": False,
        "nonLoopbackRefused": False,
        "websocketConnected": False,
        "watchObserved": False,
        "ackObserved": False,
        "domSentinelObserved": False,
        "edgeExitCode": None,
        "serverExitCode": None,
        "portClosed": False,
        "profileRemoved": False,
        "result": "blocked",
        "classification": "generation-not-run",
    }


def run_generation(
    root: Path,
    temp_root: Path,
    watch_file: Path,
    edge_path: Path,
    marker: str,
    non_loopback: str,
    ordinal: int,
    generation: str,
    update: str,
    requested_port: int,
    timeout_seconds: int,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    item = blank_generation(ordinal, generation, update)
    commands: list[dict[str, Any]] = []
    handle: ServerHandle | None = None
    edge_process: subprocess.Popen[bytes] | None = None
    profile_path = temp_root / f"profile-{ordinal}"
    profile_path.mkdir()
    classification = "generation-pass"
    try:
        watch_file.write_text("baseline\n", encoding="utf-8")
        handle, ready = start_server(root, watch_file, generation, requested_port, timeout_seconds)
        item.update({"serverReady": True, "serverPid": ready["pid"], "port": ready["port"]})
        if not windows_port_connected(item["port"]):
            raise NetworkProbeError("windows-http-port-unreachable")
        item["windowsPortOpen"] = True
        if not non_loopback_refused(non_loopback, item["port"]):
            raise NetworkProbeError("non-loopback-exposure-detected")
        item["nonLoopbackRefused"] = True

        edge_argv = [
            str(edge_path), "--headless=new", "--disable-gpu", "--disable-background-networking",
            "--disable-component-update", "--disable-extensions", "--disable-sync", "--no-first-run",
            "--no-default-browser-check", "--dump-dom", f"--user-data-dir={windows_path(profile_path, root)}",
            f"http://localhost:{item['port']}/",
        ]
        edge_process = subprocess.Popen(
            edge_argv, cwd=root, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=False, start_new_session=True,
        )
        websocket = wait_server_event(handle, "websocket", 12)
        item["websocketConnected"] = websocket["generation"] == generation
        count, pid = owned_edge_process(marker)
        if count < 1 or pid is None:
            raise NetworkProbeError("windows-edge-process-unobserved")
        item["edgeProcessCount"] = count
        item["edgePid"] = pid

        watch_file.write_text(update + "\n", encoding="utf-8")
        watched = wait_server_event(handle, "watch", 8)
        if watched["update"] != update or watched["websocketCount"] < 1:
            raise NetworkProbeError("watch-update-uncorrelated")
        item["watchObserved"] = True
        acknowledged = wait_server_event(handle, "ack", 8)
        if acknowledged["update"] != update:
            raise NetworkProbeError("browser-ack-uncorrelated")
        item["ackObserved"] = True
        try:
            stdout, stderr = edge_process.communicate(timeout=12)
        except subprocess.TimeoutExpired as error:
            raise NetworkProbeError("edge-dom-timeout") from error
        if len(stdout) > 1_000_000 or len(stderr) > 1_000_000:
            raise NetworkProbeError("edge-output-too-large")
        item["edgeExitCode"] = edge_process.returncode
        sentinel = f"VEM_NETWORK_PREFLIGHT_OK:{generation}:{update}".encode()
        item["domSentinelObserved"] = sentinel in stdout
        if edge_process.returncode != 0:
            raise NetworkProbeError("edge-launch-nonzero")
        if not item["domSentinelObserved"]:
            raise NetworkProbeError("edge-dom-sentinel-missing")
    except NetworkProbeError as error:
        classification = error.classification
    except (OSError, subprocess.SubprocessError):
        classification = "generation-execution-failed"
    finally:
        cleanup, _ = edge_probe.cleanup_owned_edge(marker, root)
        if edge_process is not None and edge_process.poll() is None:
            try:
                edge_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(edge_process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                edge_process.wait(timeout=5)
        if item["edgeExitCode"] is None and edge_process is not None:
            item["edgeExitCode"] = edge_process.returncode
        if handle is not None:
            item["serverExitCode"] = stop_server(handle)
        try:
            item["portClosed"] = item["port"] is not None and not windows_port_connected(item["port"])
        except NetworkProbeError:
            item["portClosed"] = False
        try:
            shutil.rmtree(profile_path)
        except OSError:
            pass
        item["profileRemoved"] = not profile_path.exists()
        if cleanup["result"] != "pass" and classification == "generation-pass":
            classification = cleanup["classification"]

    passed = all(item[name] for name in [
        "serverReady", "windowsPortOpen", "nonLoopbackRefused", "websocketConnected", "watchObserved",
        "ackObserved", "domSentinelObserved", "portClosed", "profileRemoved",
    ]) and item["edgeExitCode"] == 0 and item["serverExitCode"] == 0 and item["serverPid"] is not None and item["edgePid"] is not None and item["edgeProcessCount"] > 0 and item["port"] is not None
    item["result"] = "pass" if passed and classification == "generation-pass" else (
        "fail" if classification in {"non-loopback-exposure-detected", "edge-launch-nonzero", "edge-dom-sentinel-missing"} else "blocked"
    )
    item["classification"] = "http-websocket-watch-ack" if item["result"] == "pass" else classification
    commands.extend([
        command_record(f"wsl-server-generation-{ordinal}", ["node", SERVER_PATH, "--port", "<random-loopback>", "--generation", f"<generation-{ordinal}>", "--watch-file", "<task-temp>", "--timeout-ms", "<bounded>"], item["result"], item["classification"], item["serverExitCode"]),
        command_record(f"windows-edge-generation-{ordinal}", ["msedge.exe", "--headless=new", "--dump-dom", "--user-data-dir=<task-temp>", "http://localhost:<random>/"], item["result"], "dom-sentinel" if item["domSentinelObserved"] else item["classification"], item["edgeExitCode"]),
        command_record(f"windows-port-close-generation-{ordinal}", ["powershell.exe", "-NoProfile", "-Command", "<bounded-localhost-port-probe>"], "pass" if item["portClosed"] else "blocked", "port-closed" if item["portClosed"] else "port-close-unconfirmed", 0 if item["portClosed"] else None),
    ])
    return item, commands


def run_profile(root: Path, run_id: str, timeout_seconds: int) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    discovered = subprocess.run(
        ["powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", edge_probe.WINDOWS_DISCOVERY_COMMAND],
        cwd=root, check=False, capture_output=True, text=False, timeout=15,
    )
    if discovered.returncode != 0:
        raise NetworkProbeError("edge-discovery-failed")
    parsed = edge_probe.parse_discovery(discovered.stdout)
    edge = parsed["adapter"]["binary"]
    if edge["result"] != "pass":
        raise NetworkProbeError("edge-binary-missing")
    edge_path = edge_probe.EDGE_PATHS[edge["location"]]
    converted = subprocess.run(
        ["wslpath", "-u", parsed["windowsTemp"]], cwd=root, check=False, capture_output=True, text=True, timeout=10,
    )
    temp_base = Path(converted.stdout.strip()).resolve() if converted.returncode == 0 and converted.stdout.strip() else Path("/")
    if not edge_probe.windows_temp_base_allowed(temp_base):
        raise NetworkProbeError("windows-temp-unavailable")
    edge_temp_root = Path(tempfile.mkdtemp(prefix="vem-edge-preflight-network-", dir=temp_base))
    wsl_temp_root = Path(tempfile.mkdtemp(prefix=".vem-network-preflight-", dir=root.parent))
    marker = edge_temp_root.name
    watch_file = wsl_temp_root / "watch.txt"
    watch_file.write_text("baseline\n", encoding="utf-8")
    suffix = uuid.uuid4().hex[:12]
    generations: list[dict[str, Any]] = []
    commands: list[dict[str, Any]] = []
    cleanup_result = {"result": "blocked", "classification": "cleanup-unconfirmed", "serverResidue": 0, "edgeResidue": 0, "tempRemoved": False}
    try:
        address = non_loopback_ipv4()
        first, first_commands = run_generation(
            root, edge_temp_root, watch_file, edge_path, marker, address, 1,
            f"generation-1-{suffix}", f"update-1-{suffix}", 0, timeout_seconds,
        )
        generations.append(first)
        commands.extend(first_commands)
        second_suffix = uuid.uuid4().hex[:12]
        second, second_commands = run_generation(
            root, edge_temp_root, watch_file, edge_path, marker, address, 2,
            f"generation-2-{second_suffix}", f"update-2-{second_suffix}", first["port"] if isinstance(first["port"], int) else 0, timeout_seconds,
        )
        generations.append(second)
        commands.extend(second_commands)
    finally:
        edge_cleanup, _ = edge_probe.cleanup_owned_edge(marker, root)
        try:
            shutil.rmtree(edge_temp_root)
        except OSError:
            pass
        try:
            shutil.rmtree(wsl_temp_root)
        except OSError:
            pass
        server_residue = sum(1 for item in generations if isinstance(item["serverPid"], int) and process_exists(item["serverPid"]))
        temp_removed = not edge_temp_root.exists() and not wsl_temp_root.exists()
        clean = server_residue == 0 and edge_cleanup["residualAfterCleanup"] == 0 and temp_removed
        cleanup_result = {
            "result": "pass" if clean else "fail",
            "classification": "all-owned-resources-removed" if clean else "cleanup-residue",
            "serverResidue": server_residue,
            "edgeResidue": edge_cleanup["residualAfterCleanup"],
            "tempRemoved": temp_removed,
        }
    profile = {
        "schemaVersion": PROFILE_SCHEMA,
        "taskId": TASK_ID,
        "runId": run_id,
        "recordedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "edge": {
            "result": edge["result"],
            "classification": edge["classification"],
            "location": edge["location"],
            "productVersion": edge["productVersion"],
        },
        "generations": generations,
        "cleanup": cleanup_result,
        "overall": "blocked",
    }
    profile["overall"] = derive_overall(profile)
    validate_profile(profile)
    return profile, commands


def build_environment(root: Path, details_path: Path, profile: dict[str, Any], commands: list[dict[str, Any]]) -> dict[str, Any]:
    node_command, node_text = preflight._run(["node", "--version"])
    node_version = node_text.removeprefix("v") or None
    generation_results = [item["result"] for item in profile["generations"]]
    restart_ready = all(result == "pass" for result in generation_results)
    restart_result = "pass" if restart_ready else ("fail" if "fail" in generation_results else "blocked")
    checks = [
        {
            "id": "p0-t0d-two-generation-topology",
            "result": restart_result,
            "classification": f"two-wsl-pids={profile['generations'][0]['serverPid'] != profile['generations'][1]['serverPid']} two-windows-edge-observations={all(item['edgeProcessCount'] > 0 for item in profile['generations'])}",
            "evidenceRefs": [f"artifact:{details_path.as_posix()}"],
        },
        {
            "id": "p0-t0d-http-websocket-hmr",
            "result": restart_result,
            "classification": "edge-http-websocket-native-watch-correlated",
            "evidenceRefs": [f"artifact:{details_path.as_posix()}"],
        },
        {
            "id": "p0-t0d-loopback-port-restart",
            "result": restart_result,
            "classification": "loopback-only same-port-close-restart-new-generation",
            "evidenceRefs": [f"artifact:{details_path.as_posix()}"],
        },
        {
            "id": "p0-t0d-cleanup",
            "result": profile["cleanup"]["result"],
            "classification": profile["cleanup"]["classification"],
            "evidenceRefs": [f"artifact:{details_path.as_posix()}"],
        },
    ]
    if node_command["result"] != "pass" or node_version != NODE_VERSION:
        checks.append({"id": "p0-t0d-node-baseline", "result": "fail", "classification": f"node={node_version}", "evidenceRefs": [f"artifact:{details_path.as_posix()}"]})
    overall = preflight.derive_overall([item["result"] for item in checks])
    environment = {
        "schemaVersion": preflight.SCHEMA_VERSION,
        "taskId": TASK_ID,
        "runId": profile["runId"],
        "recordedAt": profile["recordedAt"],
        "contractIds": [preflight.CONTRACT_ID],
        "executionProfile": {
            "name": "WSL ext4 Node loopback server plus real Windows Edge Stable",
            "canonicalGitRoot": str(root),
            "projectRoot": ".",
            "filesystemType": "ext4",
            "runnerOwner": pwd.getpwuid(os.geteuid()).pw_name,
            "tier1BrowserOwner": "Windows Edge Stable via WSL localhost forwarding",
        },
        "commands": [node_command, *commands],
        "tools": {
            "node": {"exactVersion": NODE_VERSION, "observedVersion": node_version, "versionCommand": ["node", "--version"], "selectionSource": f"https://nodejs.org/en/blog/release/v{NODE_VERSION}", "result": "pass" if node_version == NODE_VERSION else "fail"},
            "pnpm": {"exactVersion": PNPM_VERSION, "observedVersion": None, "versionCommand": ["pnpm", "--version"], "activationCommand": ["corepack", "prepare", f"pnpm@{PNPM_VERSION}", "--activate"], "selectionSource": f"https://github.com/pnpm/pnpm/releases/tag/v{PNPM_VERSION}", "result": "selected"},
        },
        "checks": checks,
        "artifacts": [
            preflight._artifact(root, details_path.as_posix()),
            preflight._artifact(root, "scripts/preflight/network_probe.py"),
            preflight._artifact(root, SERVER_PATH),
            preflight._artifact(root, "scripts/preflight/evidence.schema.json"),
            preflight._artifact(root, "docs/adr/0001-edge-execution-preflight.md"),
        ],
        "overall": overall,
    }
    preflight.validate_evidence(environment)
    return environment


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--details", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--timeout-seconds", type=int, default=30, choices=range(15, 61))
    args = parser.parse_args(argv)
    root = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], check=True, capture_output=True, text=True, timeout=10).stdout.strip()).resolve()
    if Path.cwd().resolve() != root:
        raise NetworkProbeError("canonical-root-required")
    profile, commands = run_profile(root, args.run_id, args.timeout_seconds)
    args.details.parent.mkdir(parents=True, exist_ok=True)
    args.details.write_text(json.dumps(profile, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    environment = build_environment(root, args.details, profile, commands)
    args.output.write_text(json.dumps(environment, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"P0_T0D_NETWORK={profile['overall']}")
    return 0 if profile["overall"] == "pass" and environment["overall"] == "pass" else 2


if __name__ == "__main__":
    raise SystemExit(main())
