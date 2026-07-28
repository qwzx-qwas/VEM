from __future__ import annotations

import http.client
import json
from pathlib import Path
import socket
import sys
import tempfile
import unittest
from unittest import mock

PREFLIGHT_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = PREFLIGHT_ROOT.parents[1]
sys.path.insert(0, str(PREFLIGHT_ROOT))

import network_probe  # noqa: E402


def valid_generation(ordinal: int, *, port: int = 43123) -> dict:
    return {
        "ordinal": ordinal,
        "generation": f"generation-{ordinal}-{'a' * 12 if ordinal == 1 else 'b' * 12}",
        "update": f"update-{ordinal}-{'c' * 12 if ordinal == 1 else 'd' * 12}",
        "serverPid": 1000 + ordinal,
        "edgePid": 2000 + ordinal,
        "edgeProcessCount": 4,
        "port": port,
        "serverReady": True,
        "windowsPortOpen": True,
        "nonLoopbackRefused": True,
        "websocketConnected": True,
        "watchObserved": True,
        "ackObserved": True,
        "domSentinelObserved": True,
        "edgeExitCode": 0,
        "serverExitCode": 0,
        "portClosed": True,
        "profileRemoved": True,
        "result": "pass",
        "classification": "http-websocket-watch-ack",
    }


def valid_profile() -> dict:
    return {
        "schemaVersion": network_probe.PROFILE_SCHEMA,
        "taskId": network_probe.TASK_ID,
        "runId": "20260728T211720+0800",
        "recordedAt": "2026-07-28T21:17:20+08:00",
        "edge": {
            "result": "pass",
            "classification": "edge-stable-binary",
            "location": "program-files-x86",
            "productVersion": "150.0.4078.99",
        },
        "generations": [valid_generation(1), valid_generation(2)],
        "cleanup": {
            "result": "pass",
            "classification": "all-owned-resources-removed",
            "serverResidue": 0,
            "edgeResidue": 0,
            "tempRemoved": True,
        },
        "overall": "pass",
    }


class ProfileValidationTests(unittest.TestCase):
    def test_valid_profile_passes(self) -> None:
        network_probe.validate_profile(valid_profile())

    def test_restart_requires_distinct_generation_and_pid_on_same_port(self) -> None:
        profile = valid_profile()
        profile["generations"][1]["generation"] = profile["generations"][0]["generation"]
        with self.assertRaisesRegex(network_probe.NetworkProbeError, "generation-correlation-invalid"):
            network_probe.validate_profile(profile)
        profile = valid_profile()
        profile["generations"][1]["serverPid"] = profile["generations"][0]["serverPid"]
        with self.assertRaisesRegex(network_probe.NetworkProbeError, "pid-reused"):
            network_probe.validate_profile(profile)
        profile = valid_profile()
        profile["generations"][1]["port"] += 1
        with self.assertRaisesRegex(network_probe.NetworkProbeError, "port-not-reused"):
            network_probe.validate_profile(profile)

    def test_passing_generation_requires_every_boundary(self) -> None:
        for field in [
            "serverReady", "windowsPortOpen", "nonLoopbackRefused", "websocketConnected", "watchObserved",
            "ackObserved", "domSentinelObserved", "portClosed", "profileRemoved",
        ]:
            profile = valid_profile()
            profile["generations"][0][field] = False
            with self.assertRaisesRegex(network_probe.NetworkProbeError, "pass-without-evidence"):
                network_probe.validate_profile(profile)

    def test_nonzero_process_exit_prevents_pass(self) -> None:
        for field in ["edgeExitCode", "serverExitCode"]:
            profile = valid_profile()
            profile["generations"][0][field] = 2
            with self.assertRaisesRegex(network_probe.NetworkProbeError, "pass-without-evidence"):
                network_probe.validate_profile(profile)

    def test_blocked_generation_does_not_invent_process_or_port_identity(self) -> None:
        profile = valid_profile()
        item = profile["generations"][0]
        item.update({
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
            "profileRemoved": True,
            "result": "blocked",
            "classification": "server-listen-failed",
        })
        profile["overall"] = "blocked"
        network_probe.validate_profile(profile)

    def test_cleanup_residue_and_overall_mismatch_fail_closed(self) -> None:
        profile = valid_profile()
        profile["cleanup"]["edgeResidue"] = 1
        with self.assertRaisesRegex(network_probe.NetworkProbeError, "cleanup-pass-with-residue"):
            network_probe.validate_profile(profile)
        profile = valid_profile()
        profile["overall"] = "blocked"
        with self.assertRaisesRegex(network_probe.NetworkProbeError, "overall-mismatch"):
            network_probe.validate_profile(profile)

    def test_unknown_and_secret_fields_are_rejected(self) -> None:
        profile = valid_profile()
        profile["unknown"] = True
        with self.assertRaises(network_probe.NetworkProbeError):
            network_probe.validate_profile(profile)
        profile = valid_profile()
        profile["edge"]["authToken"] = "opaque"
        with self.assertRaisesRegex(ValueError, "secret-bearing key"):
            network_probe.validate_profile(profile)


class EventAndBoundaryTests(unittest.TestCase):
    def test_closed_server_events_parse(self) -> None:
        generation = "generation-1-aaaaaaaaaaaa"
        raw = json.dumps({"event": "ready", "generation": generation, "port": 43123, "pid": 1234}).encode()
        self.assertEqual(network_probe.parse_server_event(raw, generation)["port"], 43123)

    def test_malformed_oversize_and_wrong_generation_events_fail(self) -> None:
        generation = "generation-1-aaaaaaaaaaaa"
        with self.assertRaisesRegex(network_probe.NetworkProbeError, "event-invalid"):
            network_probe.parse_server_event(b"not-json", generation)
        with self.assertRaisesRegex(network_probe.NetworkProbeError, "too-large"):
            network_probe.parse_server_event(b"x" * 4097, generation)
        raw = json.dumps({"event": "websocket", "generation": "generation-2-bbbbbbbbbbbb"}).encode()
        with self.assertRaisesRegex(network_probe.NetworkProbeError, "generation-invalid"):
            network_probe.parse_server_event(raw, generation)

    def test_unknown_event_fields_fail_closed(self) -> None:
        generation = "generation-1-aaaaaaaaaaaa"
        raw = json.dumps({"event": "websocket", "generation": generation, "extra": True}).encode()
        with self.assertRaisesRegex(network_probe.NetworkProbeError, "shape-invalid"):
            network_probe.parse_server_event(raw, generation)

    def test_windows_port_probe_requires_boolean_closed_output(self) -> None:
        with mock.patch.object(network_probe, "powershell_json", return_value={"connected": True}):
            self.assertTrue(network_probe.windows_port_connected(43123))
        with mock.patch.object(network_probe, "powershell_json", return_value={"connected": "true"}):
            with self.assertRaisesRegex(network_probe.NetworkProbeError, "output-invalid"):
                network_probe.windows_port_connected(43123)

    def test_non_loopback_connect_result_is_not_upgraded(self) -> None:
        client = mock.MagicMock()
        client.__enter__.return_value = client
        client.connect_ex.return_value = 0
        with mock.patch.object(network_probe.socket, "socket", return_value=client):
            self.assertFalse(network_probe.non_loopback_refused("172.20.0.2", 43123))
        client.connect_ex.return_value = 111
        with mock.patch.object(network_probe.socket, "socket", return_value=client):
            self.assertTrue(network_probe.non_loopback_refused("172.20.0.2", 43123))

    def test_process_residue_probe_is_fail_closed_on_permission(self) -> None:
        with mock.patch.object(network_probe.os, "kill", side_effect=ProcessLookupError()):
            self.assertFalse(network_probe.process_exists(1234))
        with mock.patch.object(network_probe.os, "kill", side_effect=PermissionError()):
            self.assertTrue(network_probe.process_exists(1234))


class RealServerIntegrationTests(unittest.TestCase):
    def test_http_websocket_watch_ack_and_clean_shutdown(self) -> None:
        generation = "generation-1-aaaaaaaaaaaa"
        update = "update-1-cccccccccccc"
        with tempfile.TemporaryDirectory() as directory:
            watch_file = Path(directory) / "watch.txt"
            watch_file.write_text("baseline\n", encoding="utf-8")
            handle, ready = network_probe.start_server(REPOSITORY_ROOT, watch_file, generation, 0, 10)
            page = http.client.HTTPConnection("127.0.0.1", ready["port"], timeout=5)
            page.request("GET", "/")
            response = page.getresponse()
            self.assertEqual(response.status, 200)

            websocket = socket.create_connection(("127.0.0.1", ready["port"]), timeout=5)
            request = (
                f"GET /__vem/hmr?generation={generation} HTTP/1.1\r\n"
                f"Host: localhost:{ready['port']}\r\n"
                f"Origin: http://localhost:{ready['port']}\r\n"
                "Upgrade: websocket\r\n"
                "Connection: Upgrade\r\n"
                "Sec-WebSocket-Version: 13\r\n"
                "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n"
            )
            websocket.sendall(request.encode())
            handshake = websocket.recv(1024)
            self.assertIn(b"101 Switching Protocols", handshake)
            network_probe.wait_server_event(handle, "websocket", 3)

            watch_file.write_text(update + "\n", encoding="utf-8")
            watched = network_probe.wait_server_event(handle, "watch", 3)
            self.assertEqual(watched["update"], update)
            frame = websocket.recv(512)
            self.assertEqual(frame[0], 0x81)
            payload_length = frame[1] & 0x7F
            message = json.loads(frame[2:2 + payload_length])
            self.assertEqual(message, {"kind": "hmr-update", "generation": generation, "update": update})

            ack = http.client.HTTPConnection("127.0.0.1", ready["port"], timeout=5)
            ack.request("GET", f"/__vem/ack?generation={generation}&update={update}")
            self.assertEqual(ack.getresponse().status, 204)
            network_probe.wait_server_event(handle, "ack", 3)
            body = response.read()
            self.assertIn(b"VEM_NETWORK_PREFLIGHT_OK", body)
            self.assertEqual(network_probe.stop_server(handle), 0)
            websocket.close()
            page.close()
            ack.close()

    def test_invalid_websocket_origin_is_rejected(self) -> None:
        generation = "generation-1-aaaaaaaaaaaa"
        with tempfile.TemporaryDirectory() as directory:
            watch_file = Path(directory) / "watch.txt"
            watch_file.write_text("baseline\n", encoding="utf-8")
            handle, ready = network_probe.start_server(REPOSITORY_ROOT, watch_file, generation, 0, 10)
            websocket = socket.create_connection(("127.0.0.1", ready["port"]), timeout=5)
            request = (
                f"GET /__vem/hmr?generation={generation} HTTP/1.1\r\n"
                f"Host: localhost:{ready['port']}\r\n"
                "Origin: http://example.invalid\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                "Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n"
            )
            websocket.sendall(request.encode())
            self.assertIn(b"400 Bad Request", websocket.recv(512))
            self.assertEqual(network_probe.stop_server(handle), 2)
            websocket.close()


if __name__ == "__main__":
    unittest.main()
