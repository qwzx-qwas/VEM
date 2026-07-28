#!/usr/bin/env python3
"""P0-T0C direct Windows Edge Stable smoke and policy classifier."""

from __future__ import annotations

import argparse
from datetime import datetime
import json
import os
from pathlib import Path
import pwd
import shutil
import subprocess
import tempfile
from urllib.parse import quote
from typing import Any

import preflight

TASK_ID = "P0-T0C"
PROFILE_SCHEMA = "P0-T0C-profile-v1"
ADAPTER_SCHEMA = "P0-T0C-edge-adapter-v1"
NODE_VERSION = "24.18.0"
PNPM_VERSION = "10.34.0"
SENTINEL = "VEM_EDGE_PREFLIGHT_OK"
RESULTS = {"pass", "fail", "blocked", "not-run"}
POLICY_NAMES = {"DeveloperToolsAvailability", "RemoteDebuggingAllowed"}

EDGE_PATHS = {
    "program-files-x86": Path("/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"),
    "program-files": Path("/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe"),
}
WINDOWS_DISCOVERY_COMMAND = r"""
$ErrorActionPreference = "Stop"
$candidates = @(
    [ordered]@{ location = "program-files-x86"; path = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" },
    [ordered]@{ location = "program-files"; path = "C:\Program Files\Microsoft\Edge\Application\msedge.exe" }
)
$selected = $null
foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate.path -PathType Leaf) { $selected = $candidate; break }
}
$binary = if ($null -eq $selected) {
    [ordered]@{ result = "fail"; classification = "edge-binary-missing"; location = $null; productVersion = $null }
} else {
    $item = Get-Item -LiteralPath $selected.path
    [ordered]@{ result = "pass"; classification = "edge-stable-binary"; location = $selected.location; productVersion = $item.VersionInfo.ProductVersion }
}
$roots = @(
    [ordered]@{ scope = "machine"; path = "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\Edge" },
    [ordered]@{ scope = "user"; path = "Registry::HKEY_CURRENT_USER\SOFTWARE\Policies\Microsoft\Edge" }
)
$allowlisted = @("DeveloperToolsAvailability", "RemoteDebuggingAllowed")
$keyCount = 0
$propertyCount = 0
$readErrorCount = 0
$relevant = New-Object System.Collections.Generic.List[object]
foreach ($root in $roots) {
    if (-not (Test-Path -LiteralPath $root.path)) { continue }
    $keyCount += 1
    try {
        $values = Get-ItemProperty -LiteralPath $root.path
        $properties = @($values.PSObject.Properties | Where-Object { $_.Name -notlike "PS*" })
        $propertyCount += $properties.Count
        foreach ($property in $properties) {
            if ($allowlisted -notcontains $property.Name) { continue }
            $numericValue = $null
            if ($property.Value -is [bool]) { $numericValue = if ($property.Value) { 1 } else { 0 } }
            elseif ($property.Value -is [byte] -or $property.Value -is [int16] -or $property.Value -is [int32] -or $property.Value -is [int64]) { $numericValue = [int64]$property.Value }
            $relevant.Add([ordered]@{
                name = $property.Name
                scope = $root.scope
                numericValue = $numericValue
                valueClass = if ($null -eq $numericValue) { "non-numeric" } else { "numeric" }
            })
        }
    } catch { $readErrorCount += 1 }
}
$restricted = $false
$indeterminate = $false
foreach ($item in $relevant) {
    if ($item.valueClass -eq "non-numeric") { $indeterminate = $true }
    if ($item.name -eq "RemoteDebuggingAllowed" -and $item.numericValue -eq 0) { $restricted = $true }
    if ($item.name -eq "DeveloperToolsAvailability" -and $item.numericValue -eq 2) { $restricted = $true }
}
$policyClassification = if ($readErrorCount -gt 0) { "policy-read-failed" } elseif ($indeterminate) { "policy-value-indeterminate" } elseif ($restricted) { "automation-restricted" } elseif ($keyCount -gt 0) { "managed-no-relevant-block" } else { "unmanaged" }
$policyResult = if ($readErrorCount -gt 0 -or $indeterminate) { "blocked" } elseif ($restricted) { "fail" } else { "pass" }
$output = [ordered]@{
    interop = [ordered]@{
        result = "pass"
        classification = "direct-exe-inline-powershell"
        powershellVersion = $PSVersionTable.PSVersion.ToString()
        windowsVersion = [Environment]::OSVersion.VersionString
        scriptExecutionPolicy = (Get-ExecutionPolicy).ToString()
    }
    binary = $binary
    policy = [ordered]@{
        result = $policyResult
        classification = $policyClassification
        keyCount = $keyCount
        propertyCount = $propertyCount
        readErrorCount = $readErrorCount
        relevant = @($relevant.ToArray())
    }
    windowsTemp = [IO.Path]::GetTempPath()
}
$output | ConvertTo-Json -Depth 8 -Compress
"""



class EdgeProbeError(ValueError):
    pass


def exact_keys(value: Any, expected: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise EdgeProbeError(f"{label} must be an object")
    if set(value) != expected:
        raise EdgeProbeError(f"{label} keys mismatch: {sorted(set(value) ^ expected)}")
    return value


def bounded_string(value: Any, label: str, *, nullable: bool = False, maximum: int = 256) -> str | None:
    if value is None and nullable:
        return None
    if not isinstance(value, str) or not value or len(value) > maximum:
        raise EdgeProbeError(f"{label} must be a bounded non-empty string")
    return value


def result_value(value: Any, label: str) -> str:
    if value not in RESULTS:
        raise EdgeProbeError(f"{label} has unknown result")
    return value


def derive_adapter_overall(adapter: dict[str, Any]) -> str:
    values = [adapter[name]["result"] for name in ["interop", "binary", "policy", "launch", "cleanup"]]
    derived = preflight.derive_overall(values)
    return "blocked" if derived == "partial" else derived


def validate_adapter(adapter: dict[str, Any]) -> None:
    preflight._scan_for_secrets(adapter)
    exact_keys(adapter, {"schemaVersion", "interop", "binary", "policy", "launch", "cleanup", "overall"}, "adapter")
    if adapter["schemaVersion"] != ADAPTER_SCHEMA:
        raise EdgeProbeError("adapter schema mismatch")

    interop = exact_keys(
        adapter["interop"],
        {"result", "classification", "powershellVersion", "windowsVersion", "scriptExecutionPolicy"},
        "adapter.interop",
    )
    result_value(interop["result"], "adapter.interop.result")
    bounded_string(interop["classification"], "adapter.interop.classification")
    bounded_string(interop["powershellVersion"], "adapter.interop.powershellVersion", nullable=True)
    bounded_string(interop["windowsVersion"], "adapter.interop.windowsVersion", nullable=True)
    bounded_string(interop["scriptExecutionPolicy"], "adapter.interop.scriptExecutionPolicy", nullable=True, maximum=64)

    binary = exact_keys(
        adapter["binary"],
        {"result", "classification", "location", "productVersion"},
        "adapter.binary",
    )
    result_value(binary["result"], "adapter.binary.result")
    bounded_string(binary["classification"], "adapter.binary.classification")
    location = bounded_string(binary["location"], "adapter.binary.location", nullable=True)
    if location not in {None, "program-files-x86", "program-files"}:
        raise EdgeProbeError("adapter.binary.location is not allowlisted")
    bounded_string(binary["productVersion"], "adapter.binary.productVersion", nullable=True, maximum=64)

    policy = exact_keys(
        adapter["policy"],
        {"result", "classification", "keyCount", "propertyCount", "readErrorCount", "relevant"},
        "adapter.policy",
    )
    result_value(policy["result"], "adapter.policy.result")
    bounded_string(policy["classification"], "adapter.policy.classification")
    for name in ["keyCount", "propertyCount", "readErrorCount"]:
        if not isinstance(policy[name], int) or isinstance(policy[name], bool) or not 0 <= policy[name] <= 10_000:
            raise EdgeProbeError(f"adapter.policy.{name} must be a bounded integer")
    if not isinstance(policy["relevant"], list) or len(policy["relevant"]) > 8:
        raise EdgeProbeError("adapter.policy.relevant must be a bounded list")
    restricted = False
    indeterminate = False
    for index, item in enumerate(policy["relevant"]):
        item = exact_keys(item, {"name", "scope", "numericValue", "valueClass"}, f"adapter.policy.relevant[{index}]")
        if item["name"] not in POLICY_NAMES or item["scope"] not in {"machine", "user"}:
            raise EdgeProbeError("policy item name or scope is not allowlisted")
        if item["valueClass"] not in {"numeric", "non-numeric"}:
            raise EdgeProbeError("policy valueClass is unknown")
        if item["valueClass"] == "non-numeric":
            indeterminate = True
        numeric = item["numericValue"]
        if numeric is not None and (not isinstance(numeric, int) or isinstance(numeric, bool) or not -(2**31) <= numeric < 2**31):
            raise EdgeProbeError("policy numericValue must be a bounded integer or null")
        if item["name"] == "RemoteDebuggingAllowed" and numeric == 0:
            restricted = True
        if item["name"] == "DeveloperToolsAvailability" and numeric == 2:
            restricted = True
    if indeterminate and policy["result"] != "blocked":
        raise EdgeProbeError("indeterminate policy must block")
    if not indeterminate and restricted and policy["result"] != "fail":
        raise EdgeProbeError("restrictive policy must fail closed")
    if policy["classification"] == "automation-restricted" and not restricted:
        raise EdgeProbeError("automation-restricted classification lacks evidence")
    if policy["classification"] == "policy-value-indeterminate" and not indeterminate:
        raise EdgeProbeError("indeterminate classification lacks evidence")

    launch = exact_keys(
        adapter["launch"],
        {"result", "classification", "exitCode", "timedOut", "sentinelObserved", "stdoutBytes", "stderrBytes"},
        "adapter.launch",
    )
    result_value(launch["result"], "adapter.launch.result")
    bounded_string(launch["classification"], "adapter.launch.classification")
    if launch["exitCode"] is not None and (not isinstance(launch["exitCode"], int) or isinstance(launch["exitCode"], bool)):
        raise EdgeProbeError("adapter.launch.exitCode must be an integer or null")
    for name in ["timedOut", "sentinelObserved"]:
        if not isinstance(launch[name], bool):
            raise EdgeProbeError(f"adapter.launch.{name} must be boolean")
    for name in ["stdoutBytes", "stderrBytes"]:
        if not isinstance(launch[name], int) or isinstance(launch[name], bool) or not 0 <= launch[name] <= 10_000_000:
            raise EdgeProbeError(f"adapter.launch.{name} must be a bounded integer")
    if launch["result"] == "pass" and (launch["exitCode"] != 0 or launch["timedOut"] or not launch["sentinelObserved"]):
        raise EdgeProbeError("passing launch lacks exit/DOM evidence")
    if launch["timedOut"] and launch["classification"] != "launch-timeout":
        raise EdgeProbeError("timed out launch must be classified")

    cleanup = exact_keys(
        adapter["cleanup"],
        {"result", "classification", "residualBeforeCleanup", "residualAfterCleanup", "profileRemoved"},
        "adapter.cleanup",
    )
    result_value(cleanup["result"], "adapter.cleanup.result")
    bounded_string(cleanup["classification"], "adapter.cleanup.classification")
    for name in ["residualBeforeCleanup", "residualAfterCleanup"]:
        if not isinstance(cleanup[name], int) or isinstance(cleanup[name], bool) or not 0 <= cleanup[name] <= 1_000:
            raise EdgeProbeError(f"adapter.cleanup.{name} must be a bounded integer")
    if not isinstance(cleanup["profileRemoved"], bool):
        raise EdgeProbeError("adapter.cleanup.profileRemoved must be boolean")
    if cleanup["result"] == "pass" and (cleanup["residualAfterCleanup"] != 0 or not cleanup["profileRemoved"]):
        raise EdgeProbeError("passing cleanup has residue")

    if adapter["overall"] not in {"pass", "fail", "blocked"}:
        raise EdgeProbeError("adapter overall is unknown")
    derived = derive_adapter_overall(adapter)
    if adapter["overall"] != derived:
        raise EdgeProbeError(f"adapter overall does not match machine-derived {derived}")


def validate_profile(profile: dict[str, Any]) -> None:
    preflight._scan_for_secrets(profile)
    exact_keys(profile, {"schemaVersion", "taskId", "runId", "recordedAt", "adapter", "overall"}, "profile")
    if profile["schemaVersion"] != PROFILE_SCHEMA or profile["taskId"] != TASK_ID:
        raise EdgeProbeError("profile identity mismatch")
    if not isinstance(profile["runId"], str) or not preflight.RUN_ID_RE.fullmatch(profile["runId"]):
        raise EdgeProbeError("profile runId is invalid")
    recorded_at = bounded_string(profile["recordedAt"], "profile.recordedAt", maximum=64)
    parsed = datetime.fromisoformat(recorded_at)
    if parsed.utcoffset() is None:
        raise EdgeProbeError("profile.recordedAt needs an offset")
    validate_adapter(profile["adapter"])
    if profile["overall"] != profile["adapter"]["overall"]:
        raise EdgeProbeError("profile overall does not match adapter")


def failed_adapter(classification: str, *, cleanup_result: str = "blocked") -> dict[str, Any]:
    adapter = {
        "schemaVersion": ADAPTER_SCHEMA,
        "interop": {
            "result": "blocked",
            "classification": classification,
            "powershellVersion": None,
            "windowsVersion": None,
            "scriptExecutionPolicy": None,
        },
        "binary": {
            "result": "not-run",
            "classification": "interop-not-ready",
            "location": None,
            "productVersion": None,
        },
        "policy": {
            "result": "not-run",
            "classification": "interop-not-ready",
            "keyCount": 0,
            "propertyCount": 0,
            "readErrorCount": 0,
            "relevant": [],
        },
        "launch": {
            "result": "not-run",
            "classification": "interop-not-ready",
            "exitCode": None,
            "timedOut": False,
            "sentinelObserved": False,
            "stdoutBytes": 0,
            "stderrBytes": 0,
        },
        "cleanup": {
            "result": cleanup_result,
            "classification": "cleanup-unconfirmed" if cleanup_result != "pass" else "nothing-created",
            "residualBeforeCleanup": 0,
            "residualAfterCleanup": 0,
            "profileRemoved": cleanup_result == "pass",
        },
        "overall": "blocked",
    }
    validate_adapter(adapter)
    return adapter


def decode_adapter_stdout(value: str | bytes) -> str:
    if isinstance(value, str):
        return value
    if not isinstance(value, bytes) or len(value) > 1_000_000:
        raise EdgeProbeError("adapter stdout must be bounded bytes or text")
    if value.startswith((b"\xff\xfe", b"\xfe\xff")):
        return value.decode("utf-16")
    if b"\x00" in value[:128]:
        return value.decode("utf-16-le")
    try:
        return value.decode("utf-8-sig")
    except UnicodeDecodeError:
        return value.decode("cp936")



def parse_adapter_output(stdout: str) -> dict[str, Any]:
    lines = [line.strip().lstrip("\ufeff") for line in stdout.splitlines() if line.strip()]
    if len(lines) != 1:
        raise EdgeProbeError("adapter must emit exactly one JSON line")
    try:
        value = json.loads(lines[0])
    except json.JSONDecodeError as error:
        raise EdgeProbeError("adapter output is not JSON") from error
    validate_adapter(value)
    return value


def make_command(
    command_id: str,
    argv: list[str],
    *,
    result: str,
    classification: str,
    exit_code: int | None,
) -> dict[str, Any]:
    return {
        "id": command_id,
        "argv": argv,
        "exitCode": exit_code,
        "result": result,
        "stdoutSummary": classification,
        "stderrSummary": None,
    }


def direct_command(result: str, classification: str, exit_code: int | None) -> dict[str, Any]:
    return make_command(
        "windows-edge-direct-smoke",
        ["msedge.exe", "--headless=new", "--dump-dom", "--user-data-dir=<task-temp>", "file://<task-temp>"],
        result=result,
        classification=classification,
        exit_code=exit_code,
    )


def discovery_command(result: str, classification: str, exit_code: int | None) -> dict[str, Any]:
    return make_command(
        "windows-edge-policy-discovery",
        ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", "<bounded-edge-discovery-policy>"],
        result=result,
        classification=classification,
        exit_code=exit_code,
    )


def parse_discovery(stdout: bytes | str) -> dict[str, Any]:
    try:
        value = json.loads(decode_adapter_stdout(stdout).strip().lstrip("\ufeff"))
    except (json.JSONDecodeError, UnicodeError) as error:
        raise EdgeProbeError("Windows discovery output is invalid") from error
    exact_keys(value, {"interop", "binary", "policy", "windowsTemp"}, "discovery")
    bounded_string(value["windowsTemp"], "discovery.windowsTemp", maximum=512)
    adapter = {
        "schemaVersion": ADAPTER_SCHEMA,
        "interop": value["interop"],
        "binary": value["binary"],
        "policy": value["policy"],
        "launch": {
            "result": "not-run",
            "classification": "launch-not-run",
            "exitCode": None,
            "timedOut": False,
            "sentinelObserved": False,
            "stdoutBytes": 0,
            "stderrBytes": 0,
        },
        "cleanup": {
            "result": "pass",
            "classification": "nothing-created",
            "residualBeforeCleanup": 0,
            "residualAfterCleanup": 0,
            "profileRemoved": True,
        },
        "overall": "blocked",
    }
    adapter["overall"] = derive_adapter_overall(adapter)
    validate_adapter(adapter)
    return {"adapter": adapter, "windowsTemp": value["windowsTemp"]}


def windows_temp_base_allowed(path: Path) -> bool:
    return str(path).startswith("/mnt/c/") and path.is_dir()


def windows_file_uri(windows_path: str) -> str:
    normalized = windows_path.replace(chr(92), "/")
    if len(normalized) < 3 or normalized[1:3] != ":/":
        raise EdgeProbeError("Windows file path is not drive-absolute")
    return "file:///" + quote(normalized, safe="/:")


def cleanup_owned_edge(marker: str, root: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    if not marker.startswith("vem-edge-preflight-") or len(marker) > 96:
        raise EdgeProbeError("cleanup marker is invalid")
    command_text = rf"""
$ErrorActionPreference = "Stop"
$marker = "{marker}"
$owned = @(Get-CimInstance Win32_Process | Where-Object {{ $_.Name -eq "msedge.exe" -and $null -ne $_.CommandLine -and $_.CommandLine.Contains($marker) }})
$before = $owned.Count
foreach ($process in $owned) {{ & taskkill.exe /PID $process.ProcessId /T /F 2>$null | Out-Null }}
if ($before -gt 0) {{ Start-Sleep -Milliseconds 500 }}
$after = @(Get-CimInstance Win32_Process | Where-Object {{ $_.Name -eq "msedge.exe" -and $null -ne $_.CommandLine -and $_.CommandLine.Contains($marker) }}).Count
[ordered]@{{ before = $before; after = $after }} | ConvertTo-Json -Compress
"""
    try:
        completed = subprocess.run(
            ["powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command_text],
            cwd=root,
            check=False,
            capture_output=True,
            text=False,
            timeout=15,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return {
            "result": "blocked",
            "classification": "cleanup-query-failed",
            "residualBeforeCleanup": 0,
            "residualAfterCleanup": 0,
            "profileRemoved": False,
        }, make_command(
            "windows-edge-owned-process-cleanup",
            ["powershell.exe", "-NoProfile", "-Command", "<bounded-marker-cleanup>"],
            result="blocked",
            classification="cleanup-query-failed",
            exit_code=None,
        )
    if completed.returncode != 0:
        return {
            "result": "blocked",
            "classification": "cleanup-query-failed",
            "residualBeforeCleanup": 0,
            "residualAfterCleanup": 0,
            "profileRemoved": False,
        }, make_command(
            "windows-edge-owned-process-cleanup",
            ["powershell.exe", "-NoProfile", "-Command", "<bounded-marker-cleanup>"],
            result="blocked",
            classification="cleanup-query-failed",
            exit_code=completed.returncode,
        )
    try:
        counts = json.loads(decode_adapter_stdout(completed.stdout).strip().lstrip("\ufeff"))
        exact_keys(counts, {"before", "after"}, "cleanupCounts")
        before = int(counts["before"])
        after = int(counts["after"])
    except (ValueError, TypeError, UnicodeError):
        before = 0
        after = 0
        result = "blocked"
        classification = "cleanup-output-invalid"
    else:
        result = "pass" if after == 0 else "fail"
        classification = "owned-residue-terminated" if before > 0 and after == 0 else (
            "clean-exit" if after == 0 else "cleanup-residue"
        )
    cleanup = {
        "result": result,
        "classification": classification,
        "residualBeforeCleanup": before,
        "residualAfterCleanup": after,
        "profileRemoved": False,
    }
    command = make_command(
        "windows-edge-owned-process-cleanup",
        ["powershell.exe", "-NoProfile", "-Command", "<bounded-marker-cleanup>"],
        result=result,
        classification=classification,
        exit_code=completed.returncode,
    )
    return cleanup, command


def run_adapter(root: Path, timeout_seconds: int) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    try:
        discovered = subprocess.run(
            ["powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", WINDOWS_DISCOVERY_COMMAND],
            cwd=root,
            check=False,
            capture_output=True,
            text=False,
            timeout=15,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return failed_adapter("powershell-discovery-unavailable", cleanup_result="pass"), [
            discovery_command("blocked", "powershell-discovery-unavailable", None)
        ]
    if discovered.returncode != 0:
        return failed_adapter("powershell-discovery-nonzero", cleanup_result="pass"), [
            discovery_command("blocked", "powershell-discovery-nonzero", discovered.returncode)
        ]
    try:
        parsed = parse_discovery(discovered.stdout)
    except EdgeProbeError:
        return failed_adapter("powershell-discovery-invalid", cleanup_result="pass"), [
            discovery_command("blocked", "powershell-discovery-invalid", discovered.returncode)
        ]
    adapter = parsed["adapter"]
    commands = [discovery_command("pass", "bounded-discovery-produced-classified-result", discovered.returncode)]
    if adapter["binary"]["result"] != "pass":
        adapter["launch"]["classification"] = "binary-not-ready"
        adapter["overall"] = derive_adapter_overall(adapter)
        validate_adapter(adapter)
        commands.append(direct_command("not-run", "binary-not-ready", None))
        return adapter, commands

    edge_path = EDGE_PATHS.get(adapter["binary"]["location"])
    if edge_path is None or not edge_path.is_file():
        adapter["launch"].update({"result": "blocked", "classification": "wsl-edge-path-unavailable"})
        adapter["overall"] = derive_adapter_overall(adapter)
        validate_adapter(adapter)
        commands.append(direct_command("blocked", "wsl-edge-path-unavailable", None))
        return adapter, commands

    try:
        converted_temp = subprocess.run(
            ["wslpath", "-u", parsed["windowsTemp"]],
            cwd=root,
            check=False,
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        converted_temp = None
    if converted_temp is None or converted_temp.returncode != 0 or not converted_temp.stdout.strip():
        adapter["launch"].update({"result": "blocked", "classification": "windows-temp-conversion-failed"})
        adapter["overall"] = derive_adapter_overall(adapter)
        validate_adapter(adapter)
        commands.append(direct_command("blocked", "windows-temp-conversion-failed", None))
        return adapter, commands
    temp_base = Path(converted_temp.stdout.strip()).resolve()
    if not windows_temp_base_allowed(temp_base):
        adapter["launch"].update({"result": "blocked", "classification": "windows-temp-profile-invalid"})
        adapter["overall"] = derive_adapter_overall(adapter)
        validate_adapter(adapter)
        commands.append(direct_command("blocked", "windows-temp-profile-invalid", None))
        return adapter, commands

    temp_root = Path(tempfile.mkdtemp(prefix="vem-edge-preflight-", dir=temp_base))
    marker = temp_root.name
    profile_path = temp_root / "profile"
    html_path = temp_root / "sentinel.html"
    profile_path.mkdir()
    html_path.write_text(
        f"<!doctype html><html><body><main id=\"vem-edge-preflight\">{SENTINEL}</main></body></html>",
        encoding="utf-8",
    )
    try:
        profile_conversion = subprocess.run(
            ["wslpath", "-w", str(profile_path)],
            cwd=root,
            check=False,
            capture_output=True,
            text=True,
            timeout=10,
        )
        html_conversion = subprocess.run(
            ["wslpath", "-w", str(html_path)],
            cwd=root,
            check=False,
            capture_output=True,
            text=True,
            timeout=10,
        )
        if profile_conversion.returncode != 0 or html_conversion.returncode != 0:
            raise EdgeProbeError("temporary Windows paths could not be converted")
        windows_profile = profile_conversion.stdout.strip()
        windows_html = html_conversion.stdout.strip()
        if not windows_profile or not windows_html:
            raise EdgeProbeError("temporary Windows paths could not be converted")
        edge_argv = [
            str(edge_path),
            "--headless=new",
            "--disable-gpu",
            "--disable-background-networking",
            "--disable-component-update",
            "--disable-extensions",
            "--disable-sync",
            "--no-first-run",
            "--no-default-browser-check",
            "--dump-dom",
            f"--user-data-dir={windows_profile}",
            windows_file_uri(windows_html),
        ]
        try:
            completed = subprocess.run(
                edge_argv,
                cwd=root,
                check=False,
                capture_output=True,
                text=False,
                timeout=timeout_seconds,
            )
        except subprocess.TimeoutExpired as error:
            stdout = error.stdout if isinstance(error.stdout, bytes) else b""
            stderr = error.stderr if isinstance(error.stderr, bytes) else b""
            adapter["launch"] = {
                "result": "blocked",
                "classification": "launch-timeout",
                "exitCode": None,
                "timedOut": True,
                "sentinelObserved": SENTINEL.encode() in stdout,
                "stdoutBytes": len(stdout),
                "stderrBytes": len(stderr),
            }
        except FileNotFoundError:
            adapter["launch"].update({"result": "blocked", "classification": "edge-binary-race"})
        else:
            sentinel_observed = SENTINEL.encode() in completed.stdout
            classification = "direct-headless-dump-dom" if completed.returncode == 0 and sentinel_observed else (
                "launch-nonzero" if completed.returncode != 0 else "dom-sentinel-missing"
            )
            adapter["launch"] = {
                "result": "pass" if classification == "direct-headless-dump-dom" else "fail",
                "classification": classification,
                "exitCode": completed.returncode,
                "timedOut": False,
                "sentinelObserved": sentinel_observed,
                "stdoutBytes": len(completed.stdout),
                "stderrBytes": len(completed.stderr),
            }
    except (OSError, EdgeProbeError, subprocess.TimeoutExpired):
        adapter["launch"].update({"result": "blocked", "classification": "launch-setup-failed"})
    finally:
        cleanup, cleanup_command = cleanup_owned_edge(marker, root)
        try:
            shutil.rmtree(temp_root)
        except OSError:
            pass
        cleanup["profileRemoved"] = not temp_root.exists()
        if not cleanup["profileRemoved"]:
            cleanup["result"] = "fail"
            cleanup["classification"] = "profile-cleanup-residue"
            cleanup_command["result"] = "fail"
            cleanup_command["stdoutSummary"] = "profile-cleanup-residue"
        adapter["cleanup"] = cleanup
        commands.append(cleanup_command)

    commands.insert(1, direct_command(adapter["launch"]["result"], adapter["launch"]["classification"], adapter["launch"]["exitCode"]))
    adapter["overall"] = derive_adapter_overall(adapter)
    validate_adapter(adapter)
    return adapter, commands


def build_environment(
    root: Path,
    details_path: Path,
    profile: dict[str, Any],
    edge_commands: list[dict[str, Any]],
) -> dict[str, Any]:
    node_command, node_text = preflight._run(["node", "--version"])
    node_version = node_text.removeprefix("v") or None
    adapter = profile["adapter"]
    checks = [
        {
            "id": "p0-t0c-interop",
            "result": adapter["interop"]["result"],
            "classification": f"{adapter['interop']['classification']} powershell={adapter['interop']['powershellVersion']} windows={adapter['interop']['windowsVersion']} scriptPolicy={adapter['interop']['scriptExecutionPolicy']}",
            "evidenceRefs": [f"artifact:{details_path.as_posix()}"],
        },
        {
            "id": "p0-t0c-edge-binary",
            "result": adapter["binary"]["result"],
            "classification": f"{adapter['binary']['classification']} location={adapter['binary']['location']} version={adapter['binary']['productVersion']}",
            "evidenceRefs": [f"artifact:{details_path.as_posix()}"],
        },
        {
            "id": "p0-t0c-policy",
            "result": adapter["policy"]["result"],
            "classification": f"{adapter['policy']['classification']} keys={adapter['policy']['keyCount']} properties={adapter['policy']['propertyCount']}",
            "evidenceRefs": [f"artifact:{details_path.as_posix()}"],
        },
        {
            "id": "p0-t0c-direct-launch",
            "result": adapter["launch"]["result"],
            "classification": f"{adapter['launch']['classification']} sentinel={adapter['launch']['sentinelObserved']} timeout={adapter['launch']['timedOut']}",
            "evidenceRefs": [f"artifact:{details_path.as_posix()}"],
        },
        {
            "id": "p0-t0c-cleanup",
            "result": adapter["cleanup"]["result"],
            "classification": f"{adapter['cleanup']['classification']} residual={adapter['cleanup']['residualAfterCleanup']} profileRemoved={adapter['cleanup']['profileRemoved']}",
            "evidenceRefs": [f"artifact:{details_path.as_posix()}"],
        },
    ]
    if node_command["result"] != "pass" or node_version != NODE_VERSION:
        checks.append({
            "id": "p0-t0c-node-baseline",
            "result": "fail" if node_command["result"] == "pass" else node_command["result"],
            "classification": f"node={node_version}",
            "evidenceRefs": [f"artifact:{details_path.as_posix()}"],
        })
    overall = preflight.derive_overall([check["result"] for check in checks])
    node_tool_result = "pass" if node_version == NODE_VERSION else (
        "fail" if node_command["result"] == "pass" else node_command["result"]
    )
    environment = {
        "schemaVersion": preflight.SCHEMA_VERSION,
        "taskId": TASK_ID,
        "runId": profile["runId"],
        "recordedAt": profile["recordedAt"],
        "contractIds": [preflight.CONTRACT_ID],
        "executionProfile": {
            "name": "WSL canonical ext4 with direct Windows Edge Stable smoke",
            "canonicalGitRoot": str(root),
            "projectRoot": ".",
            "filesystemType": "ext4",
            "runnerOwner": pwd.getpwuid(os.geteuid()).pw_name,
            "tier1BrowserOwner": "Windows Edge Stable via WSL PowerShell interop",
        },
        "commands": [node_command, *edge_commands],
        "tools": {
            "node": {
                "exactVersion": NODE_VERSION,
                "observedVersion": node_version,
                "versionCommand": ["node", "--version"],
                "selectionSource": f"https://nodejs.org/en/blog/release/v{NODE_VERSION}",
                "result": node_tool_result,
            },
            "pnpm": {
                "exactVersion": PNPM_VERSION,
                "observedVersion": None,
                "versionCommand": ["pnpm", "--version"],
                "activationCommand": ["corepack", "prepare", f"pnpm@{PNPM_VERSION}", "--activate"],
                "selectionSource": f"https://github.com/pnpm/pnpm/releases/tag/v{PNPM_VERSION}",
                "result": "selected",
            },
        },
        "checks": checks,
        "artifacts": [
            preflight._artifact(root, details_path.as_posix()),
            preflight._artifact(root, "scripts/preflight/edge_probe.py"),
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
    parser.add_argument("--timeout-seconds", type=int, default=30, choices=range(5, 121))
    args = parser.parse_args(argv)

    root_text = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        check=True,
        capture_output=True,
        text=True,
        timeout=10,
    ).stdout.strip()
    root = Path(root_text).resolve()
    if Path.cwd().resolve() != root:
        raise EdgeProbeError("run edge probe from canonical Git root")

    adapter, edge_commands = run_adapter(root, args.timeout_seconds)
    profile = {
        "schemaVersion": PROFILE_SCHEMA,
        "taskId": TASK_ID,
        "runId": args.run_id,
        "recordedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "adapter": adapter,
        "overall": adapter["overall"],
    }
    validate_profile(profile)
    args.details.parent.mkdir(parents=True, exist_ok=True)
    args.details.write_text(json.dumps(profile, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    environment = build_environment(root, args.details, profile, edge_commands)
    args.output.write_text(json.dumps(environment, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"P0_T0C_EDGE={profile['overall']}")
    return 0 if profile["overall"] == "pass" and environment["overall"] == "pass" else 2


if __name__ == "__main__":
    raise SystemExit(main())
