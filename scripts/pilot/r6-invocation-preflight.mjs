import { canonicalSha256 } from "../../packages/pilot-harness/dist/index.js";
import {
  buildR3CodexCapsuleInvocation,
  buildR3PermissionProfileProbeInvocation,
  R3_OUTER_PROCESS_ENV,
  runR3PermissionProfileProbe,
} from "./r3-capsule.mjs";
import { isR5ProcessInvocation } from "./r5-process-terminalizer.mjs";

const EXPECTED_OUTER_ENV = Object.freeze({ PATH: "/usr/bin:/bin" });
const SENSITIVE_ENV_NAME = /(?:^|_)(?:AUTH|KEY|PASSWORD|SECRET|TOKEN)(?:_|$)/iu;

export function verifyR6InvocationCompatibility({
  decisionCapsule,
  probeCapsule,
  authFile,
  codexInstallRoot,
  spawn,
}) {
  const invocation = buildR3CodexCapsuleInvocation({
    capsule: decisionCapsule,
    prompt: "R6 local invocation construction only; do not execute.",
    model: "gpt-5.6-sol",
    authFile,
    ...(codexInstallRoot === undefined ? {} : { codexInstallRoot }),
  });
  const envEntries = Object.entries(invocation.env ?? {});
  if (!isR5ProcessInvocation(invocation)
    || invocation.env !== R3_OUTER_PROCESS_ENV
    || !Object.isFrozen(invocation.env)
    || !Object.isFrozen(invocation)
    || !Object.isFrozen(invocation.args)
    || !Object.isFrozen(invocation.evidence)
    || envEntries.length !== 1
    || envEntries[0][0] !== "PATH"
    || envEntries[0][1] !== EXPECTED_OUTER_ENV.PATH
    || envEntries.some(([name, value]) => (
      SENSITIVE_ENV_NAME.test(name)
      || /(?:^|\/)(?:home|mnt|root)(?:\/|$)/u.test(value)
    ))
    || invocation.evidence.outerProcessEnvironment !== invocation.env
    || invocation.evidence.outerProcessEnvironmentPolicy
      !== "fixed-path-only-no-host-inheritance") {
    throw new Error("R6_INVOCATION_COMPATIBILITY_FAILED");
  }

  const probeInvocation = buildR3PermissionProfileProbeInvocation({
    capsule: probeCapsule,
    ...(codexInstallRoot === undefined ? {} : { codexInstallRoot }),
  });
  if (!isR5ProcessInvocation(probeInvocation)
    || probeInvocation.env !== R3_OUTER_PROCESS_ENV
    || probeInvocation.args.includes("exec")
    || probeInvocation.args.includes("--json")
    || probeInvocation.args.includes("--output-last-message")) {
    throw new Error("R6_INVOCATION_COMPATIBILITY_FAILED");
  }
  const permission = runR3PermissionProfileProbe(
    probeInvocation,
    spawn === undefined ? {} : { spawn },
  );
  if (permission.ok !== true
    || permission.modelCall !== false
    || permission.workspaceWritable !== false
    || permission.authReadable !== false
    || permission.procEnvironmentSensitiveValuesAbsent !== true
    || permission.networkRuntimeProbed !== false) {
    throw new Error("R6_INVOCATION_COMPATIBILITY_FAILED");
  }
  return Object.freeze({
    schemaVersion: "R6-T2-invocation-compatibility-v1",
    ok: true,
    exactDecisionInvocationConstructed: true,
    exactDecisionInvocationExecuted: false,
    terminalizerInvocationPredicatePassed: true,
    outerEnvironment: R3_OUTER_PROCESS_ENV,
    outerEnvironmentHash: canonicalSha256(R3_OUTER_PROCESS_ENV),
    outerEnvironmentInheritedFromHost: false,
    outerEnvironmentSensitiveEntryCount: 0,
    permissionProfilePassed: true,
    workspaceWritable: false,
    authReadableToGeneratedCommands: false,
    providerNetworkProbed: false,
    modelCall: false,
    invocationEvidenceHash: canonicalSha256(invocation.evidence),
    probeInvocationEvidenceHash: canonicalSha256(probeInvocation.evidence),
  });
}
