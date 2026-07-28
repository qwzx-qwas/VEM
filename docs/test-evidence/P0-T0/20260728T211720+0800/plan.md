# P0-T0D Atomic Plan

## Task identity and eligibility

- ID/status: `P0-T0D` / `done`; phase `P0` / `in_progress`.
- Dependencies: P0-T0B and P0-T0C are `done`; their evidence proves canonical ext4 native watch readiness and real Windows Edge Stable direct launch respectively. P0 has no phase dependency and this task has no decision gate.
- Direct contract: `EDGE-PREFLIGHT-001`, mapped bidirectionally between `ROADMAP.yaml` and `docs/requirements.yaml`; authoritative text is `docs/DESIGN.md` sections 3.1 and 3.1.1 plus `docs/adr/0001-edge-execution-preflight.md`.
- Observable result: prove that a real Windows Edge Stable process can traverse Windows localhost forwarding to a distinct WSL Node server/watch OS process for HTTP and WebSocket, receive a file-watch-driven HMR-style update, observe port closure, then repeat on the same random port with a new generation while the service remains unreachable through the WSL non-loopback address.

## Scope and architecture boundary

- Selected profile remains WSL Node `24.18.0` on canonical `/home/qwzx/src/VEM` ext4 plus Windows Edge Stable `150.0.4078.99`; pnpm `10.34.0` remains selected but is not executed. Staging `/mnt/d/VEM` remains read-only rollback evidence and is not touched.
- Add only dependency-free preflight probes: a minimal Node HTTP/WebSocket/file-watch server and a Python orchestrator/evidence classifier. This does not create a workspace, product coordinator, source registry, MCP transport, authentication protocol, verification transaction, extension, Playwright dependency, or production runtime.
- The WSL service binds an OS-assigned port on `127.0.0.1` only. Edge loads an HTTP fixture from Windows `localhost`; page JavaScript opens the same-origin WebSocket, receives a watch-correlated bounded update, changes a DOM sentinel, and sends a bounded HTTP acknowledgement before the page response completes.
- Implementation adjustment from observed evidence: the first bounded run put the watched file beside the Windows Edge profile and both generations correctly classified `watch-timeout` on DrvFS. The final design separates the native watch fixture into a canonical-root-adjacent ext4 temporary directory while keeping only Edge profiles in Windows temporary storage; the network, bind and policy boundaries were unchanged.
- The first server is terminated and the Windows side must observe the port closed. A second WSL server binds the same port with a distinct generation and repeats the browser path. The WSL non-loopback IPv4 address must refuse the port while each generation is active.

## Capability, trust, privacy, and lifecycle

- Inputs are locally generated generation/update identifiers, one bounded watched-file value, fixed route names, and the OS-assigned port. The server rejects unexpected method/path/query values and bounds header/request sizes through Node defaults plus explicit route/query checks.
- No page-supplied URL, filesystem path, shell command, token, cookie, credential, user browser profile, raw environment, arbitrary registry value, or product claim is accepted or retained. The browser page is test-only untrusted input and cannot gain filesystem or command authority.
- There is no fallback to `0.0.0.0`, a non-loopback bind, polling, Chromium, same-process simulation, or unauthenticated remote mode. Any Windows interop, Edge, HTTP, WebSocket handshake, watch correlation, acknowledgement, exposure, port-close, restart, stale-process, malformed-event, or cleanup uncertainty is separately classified and prevents `pass`.
- All state is ephemeral: a unique Windows Edge profile, local HTML served in memory, watched fixture, process groups, sockets and logs. Hard timeouts, marker-scoped Edge cleanup, WSL process-group termination, port-close confirmation and final directory removal are mandatory on success and failure. No queue, cache, durable artifact, pairing, selection, confirmation, capture, MCP or verification lifecycle is introduced.

## Planned changes

1. Add a dependency-free Node server that emits bounded JSON lifecycle events, serves the test page, performs a strict minimal WebSocket upgrade, uses native `fs.watch`, sends a generation/update-correlated text frame, accepts the exact browser acknowledgement, and shuts down cleanly on SIGTERM.
2. Add a Python orchestrator that starts/stops distinct server process generations, launches real Edge Stable with disposable profiles, classifies Windows reachability and port closure, checks non-loopback refusal, validates closed secret-safe detail evidence, cleans all owned resources, and emits the shared preflight evidence schema with artifact hashes.
3. Add unit/integration fixtures for HTTP/WebSocket success, malformed or missing event, unrelated update, server death, timeout, non-loopback exposure, port-close failure, generation reuse, stale process, evidence mismatch, secret rejection and cleanup. Run a real two-generation Edge/WSL smoke, the complete preflight regression suite, both schema validators, bootstrap validation, independent residue checks and SHA-256 verification.

## Pass/block rule

- Pass only when two distinct WSL server PIDs and real Windows Edge launches prove HTTP, WebSocket, native watch/HMR acknowledgement, distinct restart generations, same-port reuse, Windows-observed close between generations, non-loopback refusal, and zero task-owned process/profile/fixture residue.
- Any same-process substitute, polling, Chromium substitution, broad bind, unclassified failure, missing correlation, stale generation/process, retained raw browser payload, or cleanup uncertainty remains fail/blocked. P0-T0D does not claim private runtime ACL (P0-T0E), aggregate bootstrap readiness (P0-T0F), or Playwright `channel: msedge` (P0-T0G).
