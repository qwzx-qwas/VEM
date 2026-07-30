# Atomic Task Prompts

本文件保存从过大 roadmap item 拆出的原子任务及其可直接交给 Codex 的 prompt。`ROADMAP.yaml` 仍是任务状态与依赖的唯一事实来源；本文件不重复状态。执行任何任务前仍须依次读取 `AGENTS.md`、`docs/DESIGN.md`、`docs/requirements.yaml`、`ROADMAP.yaml` 和 `PLANS.md`，确认依赖满足，并且一次只执行一个 task。

所有 prompt 共用以下规则：只改当前 task；先写/更新测试；不得削弱安全、隐私、证据或测试门禁；外部阻塞要保存证据并标记 blocked；通过后才更新 roadmap/progress；结束时使用 `AGENTS.md` 的报告格式。

若执行因上下文或预算中断，在 `docs/checkpoints/<TASK-ID>.md` 记录最后完成步骤、已有证据和准确下一步。默认不要在本 prompt 文件下追加局部进度；若 owner 明确要求逐 prompt 标注完成，可以在对应 prompt 后追加简短、非权威的完成摘要。task/phase/decision 的唯一事实来源仍是 `ROADMAP.yaml`，完整完成或阻塞证据仍写入 `docs/progress.md`。

## P0-T0A0 — 只读迁移 readiness inventory

### Prompt

- **背景**：`/mnt/d/vem` 与 `/mnt/d/VEM` 可能是同一 DrvFS inode；项目内容多嵌套 `visual-element-mcp-design-bundle/`，owner migration target 为 `/home/qwzx/src/VEM`。
- **目标**：在不创建目标、不修改 source 的前提下冻结可执行迁移计划和完整 payload inventory。
- **本阶段做**：记录 Git top-level、device/inode、`sourceBaselineHead`、dirty bundle/hash、untracked manifest/hash、prefix-normalized content manifest；检查 case collision、target collision、ext4 filesystem/capacity/permission 与 rollback plan。
- **本阶段不做**：不 mkdir/copy/mv/commit/chmod source，不安装 Node/pnpm，不切换 canonical writer。
- **实现约束**：路径字符串和大小写不是身份；所有 probe 只读并证明 target 未被本 task 改动；不把 secret 写入 inventory。
- **成功路径**：migration plan 可逐项重放，所有 payload 与目标前置条件有 hash/分类证据。
- **失败路径与边界**：身份不明、case collision、目标非空、容量/权限不足或 payload 无法完整盘点即 blocked；不得以自动修复改变环境。
- **建议优先查看/修改的文件**：只读检查现有文档/Git；若保存 evidence 获得授权，只写约定 evidence 目录，不写 target。
- **测试要求**：Git/device/inode alias、dirty/untracked、prefix normalization、case collision、target no-mutation、ext4/capacity/permission 分类。
- **验收标准**：唯一结果是 owner 可审批的只读 readiness evidence；下一任务仍需独立 commit 授权。

## P0-T0A1 — Prefix-normalized migration 与 single-writer cutover

### Prompt

> **已完成（2026-07-28）**：已创建以 `sourceBaselineHead` 为直接 parent 的 project-at-root layout commit，验证 58 个冻结 payload 的 prefix-normalized 内容一致、target Git root 无嵌套且 clean，并将 `/home/qwzx/src/VEM` 切换为唯一 writer、`/mnt/d/VEM` 保留为可读但拒绝写入的 rollback。

- **背景**：P0-T0A0 已冻结 source baseline/payload 与目标 readiness；扁平化 tracked paths 意味着 old/new HEAD 和 raw tracked manifest 不可能相同。
- **目标**：创建保留历史与全部 payload 的 project-at-root layout commit，并安全切换唯一写入者。
- **本阶段做**：在 owner 明确授权后迁移到 ext4 target；以 `sourceBaselineHead` 为 parent 创建 layout commit；验证去除旧 prefix 后的相对路径/content hash、目标 Git top-level、clean worktree 与无额外 nesting；把 staging 标记为只读 rollback，记录 cutover。
- **本阶段不做**：不决定 Node/pnpm，不运行 Edge/network probes，不删除 source。
- **实现约束**：无 commit 授权即 blocked；不得自动 stash、丢弃或隐藏用户变更；cutover 前后任何时点只允许一个 writer。
- **成功路径**：target commit parent、prefix-normalized parity、clean target 与 rollback evidence 全部一致。
- **失败路径与边界**：copy/hash/commit/clean/readonly 任一失败则不宣称 cutover；若已部分写 target，隔离它并按 plan 恢复，不能继续双写。
- **建议优先查看/修改的文件**：migration evidence、Git layout；不改产品代码。
- **测试要求**：parent baseline、dirty/untracked preservation、normalized hash、non-nested root、clean target、single-writer/read-only rollback。
- **验收标准**：canonical root 可由 target `git rev-parse --show-toplevel` 发现，source 被保留但不再写。

## P0-T0A2 — Evidence schema 与 exact Node/pnpm bootstrap

### Prompt

> **已完成（2026-07-28）**：已交付 dependency-free 的 bounded evidence JSON Schema、机器校验/探测器和 valid/invalid fixtures；owner 接受 Node `24.18.0` 与 pnpm `10.34.0`，20 项目标测试、Draft 2020-12、bootstrap traceability 与 artifact hash 验证全部通过，registry/watcher/Edge probe 仍按边界留给后续任务。

- **背景**：P0-T0A1 已完成迁移/cutover，后续 probes 需要统一结果 schema 与可复现工具链决策。
- **目标**：只固定 machine-classified evidence schema 和 exact Node/pnpm bootstrap。
- **本阶段做**：定义 schema、命令/版本/profile/filesystem/runner/time/result/hash 字段与 secret redaction；探测 Node LTS 候选和 pnpm 固定机制，记录 owner-reviewed exact versions/ADR。
- **本阶段不做**：不创建 monorepo package，不运行 registry/watcher/Edge gate，不改变迁移历史。
- **实现约束**：24.x LTS 为主基线；22.x 例外必须有兼容证据且不低于 22.12；命令成功不能替代 schema evidence。
- **成功路径**：valid/invalid fixtures 可分类，版本命令在 target Git root 可重放且无 secret。
- **失败路径与边界**：版本不支持、pnpm 不可精确固定、schema 含 secret 或机器结果不确定即 blocked。
- **建议优先查看/修改的文件**：`scripts/preflight/`、preflight ADR、`docs/test-evidence/P0-T0/`。
- **测试要求**：schema fixtures、version bounds、exact pnpm、redaction、artifact hash、canonical-root-relative paths。
- **验收标准**：只交付 evidence/toolchain decision，为 P0-T0B 提供 seam。

## P0-T0B — Registry、ext4 与 watcher/HMR profile

### Prompt

> **已完成（2026-07-28）**：已在 canonical ext4 上通过 default CA registry、隔离 Corepack/pnpm 10.34.0、临时 lockfile/frozen install、大小写/symlink/长路径及原生 `node:fs.watch` create/modify/rename 探测；36 项测试与双重 schema、artifact hash、bootstrap 验证通过，watcher 30 个事件的 p50 为 0.290 ms、p95 为 0.564 ms，全部临时 fixture 已清理。

- **背景**：项目主开发路径已迁移到 `/home/qwzx/src/VEM`，必须证明 ext4 profile 可支持 pnpm、symlink、watcher 和 HMR；DrvFS 仅为可选兼容记录。
- **目标**：只验证 package/network/filesystem profile。
- **本阶段做**：探测 registry/proxy/CA、disk/path/case/symlink、临时 frozen install、文件监听和 HMR 延迟；保存原始结果 hash。
- **本阶段不做**：不创建正式 workspace，不修改全局代理，不启动 Edge release gate。
- **实现约束**：临时 fixture 可删除且不得污染 project metadata；ACL 结论留给 P0-T0E。
- **成功路径**：每项有 pass/fail 分类，watch/HMR 样本、p50/p95 与环境元数据齐全。
- **失败路径与边界**：DNS、TLS、proxy、symlink、watch timeout 分别分类；失败不降级为 polling 后静默通过。
- **建议优先查看/修改的文件**：`scripts/preflight/filesystem.*`、`scripts/preflight/registry.*`、P0-T0 evidence 目录。
- **测试要求**：无代理/错误 CA、大小写冲突、symlink、create/modify/rename watcher、超时清理。
- **验收标准**：能够明确回答当前 canonical ext4 profile 是否允许 P0-T1；不能回答即 blocked。

## P0-T0C — Edge Stable 真实启动与策略分类

### Prompt

> **已完成（2026-07-28）**：已从 canonical WSL ext4 直接启动真实 Windows Edge Stable `150.0.4078.99`，以独立临时 profile 完成 headless DOM sentinel smoke 并正常退出；在系统 `Restricted` ExecutionPolicy 下未执行 `.ps1` 或使用 bypass，企业策略分类为 unmanaged，进程/profile 零残留，52 项完整 preflight 测试及双重 schema、artifact hash、bootstrap 验证通过。

- **背景**：发现 `msedge.exe` 不等于证明 Edge 可自动化。
- **目标**：只证明 Windows Edge Stable 二进制可经 WSL interop 真实启动、版本与企业策略状态。
- **本阶段做**：通过受限 direct headless smoke 或 ADR 等价方式启动 Edge；记录 Windows/Edge 版本、interop、退出与错误类别。
- **本阶段不做**：不以 Chromium 替代 Edge，不完成 Playwright E2E，不安装扩展。
- **实现约束**：使用临时独立 profile；不接触用户主 profile；失败日志去敏。
- **成功路径**：Edge Stable 真实进程启动并退出，返回预期 DOM/exit evidence。
- **失败路径与边界**：缺失 binary、WSL interop、enterprise policy、profile lock、direct launch failure 分开报告。
- **建议优先查看/修改的文件**：`scripts/preflight/edge.*`、preflight ADR、P0-T0 evidence。
- **测试要求**：missing binary、interop/direct-launch error、profile cleanup、timeout/kill、policy-classification fixtures。
- **验收标准**：只声明 binary smoke；Playwright `channel: msedge` 仍保留为 workspace 建立后的正式 gate。

## P0-T0D — Windows/WSL HTTP、WebSocket、HMR 与双进程

### Prompt

> **已完成（2026-07-28）**：已用两个不同 WSL Node PID 在同一随机 loopback 端口完成关闭/重启，两次均由真实 Windows Edge Stable 经 HTTP + WebSocket 接收 canonical ext4 原生 `fs.watch` 相关 update，返回浏览器 ACK 与 DOM sentinel；非 loopback 连接拒绝、端口关闭和 WSL/Windows 零残留均通过，67 项完整 preflight 测试及双重 schema、artifact hash、bootstrap 验证通过。

- **背景**：Tier-1 需要 Windows Edge 到 WSL 服务的真实跨边界路径。
- **目标**：只证明两个真实 OS process、HTTP/WS/HMR、loopback 隔离和 restart 行为。
- **本阶段做**：启动最小 server/watch process；从 Windows/Edge 侧访问；触发修改；观察 WS/HMR；测试 port close/restart/non-loopback refusal。
- **本阶段不做**：不实现产品 coordinator、source registry 或 verification。
- **实现约束**：随机端口、bounded timeout、完整 cleanup；不能把同进程测试当双进程。
- **成功路径**：HTTP、WS、watch update、restart generation 均有相关 evidence。
- **失败路径与边界**：interop、firewall、WS handshake、watcher、port exposure、stale process 分别分类。
- **建议优先查看/修改的文件**：`scripts/preflight/network.*`、`scripts/preflight/two-process.*`、P0-T0 evidence。
- **测试要求**：HTTP/WS success、unrelated port、server death、restart ID change、0.0.0.0 refusal。
- **验收标准**：跨 Windows/WSL 路径可重放且所有子进程退出；否则 blocked。

## P0-T0E — 私有 runtime ACL

### Prompt

> **已完成（2026-07-28）**：已显式拒绝非 ext4 的 XDG tmpfs 候选并选择 owner-derived ext4 runtime fallback，验证 `0700` task directory、`0600` fixture、owner read/write，以及通过 WSL root 降权到 UID 65534 后的 traverse/read/write/create 真实拒绝；Windows `9p` mount 被拒绝作为 ACL evidence，两次保守 cleanup 与现有 runtime 根保留通过，83 项完整 preflight 测试及双重 schema、artifact hash、bootstrap 验证通过。

- **背景**：DrvFS mode bits 不能作为 private discovery 的安全证明。
- **目标**：只验证 WSL ext4 runtime directory 的 owner/mode/read/write/cleanup 边界。
- **本阶段做**：选择 `${XDG_RUNTIME_DIR:-$HOME/.cache}/vem`；创建 0700 目录和 0600 fixture；验证 owner、拒绝不匹配主体的策略与 cleanup。
- **本阶段不做**：不写真实 token/capability，不实现 runtime discovery。
- **实现约束**：不输出环境 secret；若无法安全模拟其他主体，明确记录 limitation 并要求受管 runner 复核。
- **成功路径**：ext4/private mode/owner/cleanup evidence 完整，DrvFS 路径被拒绝作为 ACL evidence。
- **失败路径与边界**：XDG 路径位于 DrvFS、chmod 无效、owner 不符或 cleanup 失败即 fail closed。
- **建议优先查看/修改的文件**：`scripts/preflight/runtime-acl.*`、preflight ADR、P0-T0 evidence。
- **测试要求**：mode drift、symlink escape、wrong owner、stale file、cleanup idempotency。
- **验收标准**：为后续 discovery 提供已证明的目录策略，不提前实现 discovery。

## P0-T0F — Aggregate preflight verdict

### Prompt

> **已完成（2026-07-28）**：已验证 P0-T0A0–E 七个固定 evidence bundle 的完整 SHA manifest、task-specific/shared schema、artifact hash、root/owner/ext4、exact toolchain、时间顺序、layout ancestry 与 roadmap 状态；aggregate verdict 为 `passed`，canonical digest 为 `1f77525e…d710d4ff`，90 项完整 preflight 测试及双重 schema、bootstrap、最终 SHA 验证通过，并以 ADR 0002 明确该摘要不是数字签名且 Playwright gate 仍属 P0-T0G。

- **背景**：P0-T0A0–A2 与 B–E 各自产生独立 evidence，只有本任务可以给出总 verdict。
- **目标**：记录 ADR、验证所有 hash/字段并给出 passed 或 blocked。
- **本阶段做**：聚合 A0–A2 与 B–E；校验 commit/root/version/时间/owner；生成人类摘要；固定 runner owner 与 rerun 命令。
- **本阶段不做**：不修复失败环境，不创建产品 workspace，不把部分通过写成 passed。
- **实现约束**：任一 required probe 缺失、stale 或 hash 不符则 blocked；摘要不能覆盖机器结果。
- **成功路径**：所有 required evidence 当前、可复核、无 secret，aggregate 为 passed。
- **失败路径与边界**：列出唯一安全恢复操作和需重跑的 probe；保留已通过 evidence，不伪造整体通过。
- **建议优先查看/修改的文件**：preflight ADR、`docs/test-evidence/P0-T0/`、`docs/progress.md`、`ROADMAP.yaml`。
- **测试要求**：missing/stale/tampered evidence、mixed verdict、redaction、rerun reproducibility。
- **验收标准**：只有本任务 passed 后 P0-T1 eligible。

## P0-T1 — pnpm TypeScript workspace 与许可证基线

### Prompt

> **已完成（2026-07-29）**：已建立 private pnpm monorepo，精确固定 Node `24.18.0`、pnpm `10.34.0`、TypeScript `6.0.3`、Vitest `4.1.10` 与 ESLint `10.8.0`；加入 strict TS smoke package、offline clean frozen-install、package/license policy、130 条 transitive notices 和未登记 vendored asset 的 fail-closed 检查。8 项测试、build/typecheck/lint、完整 license/provenance audit 与既有 90 项 preflight 回归均通过；未引入 Playwright、浏览器或产品能力。

- **背景**：P0-T0F aggregate preflight 已通过，允许建立 exact-version workspace，但 Playwright channel 与产品实现仍分别受 P0-T0G 和后续 task 约束。
- **目标**：创建 private pnpm TypeScript monorepo，并锁定 strict TypeScript、Vitest、ESLint 与 LICENSE-POLICY-001 基线。
- **本阶段做**：固定 Node/pnpm 与开发依赖；生成 lockfile；添加 workspace smoke；记录 Apache-2.0 项目元数据、依赖分类、完整第三方 notices 和 vendored asset provenance gate。
- **本阶段不做**：不安装 Playwright，不启动 Edge，不实现 protocol、selector、Vite transform 或产品 runtime，不授权 public distribution。
- **实现约束**：只能使用 P0-T0A2 已接受的 Node/pnpm；所有 package 保持 private；未知、forbidden 或未经显式审查的依赖许可证 fail closed；asset 必须有 source/license/hash provenance。
- **成功路径**：clean frozen install、workspace smoke、build、strict typecheck、lint、license/notices/provenance 与 bootstrap traceability 全部通过。
- **失败路径与边界**：toolchain 漂移、stale notices、review-required/forbidden license、未登记 asset 或任何测试失败时保持 incomplete，不开始 P0-T0G。
- **建议优先查看/修改的文件**：root workspace metadata、`packages/workspace-smoke/`、`scripts/workspace/`、`scripts/license/`、`docs/dependency-policy.json`、`THIRD_PARTY_NOTICES.md`。
- **测试要求**：workspace smoke、offline clean frozen install、exact Node/pnpm、package license metadata、dependency policy、third-party notices、vendored asset provenance、build/typecheck/lint。
- **验收标准**：P0-T1 独立通过；只授权下一原子任务 P0-T0G 或 P0-T2，不声明 Edge automation 或产品 capability。

## P0-T0G — Playwright `msedge` 正式 channel gate

### Prompt

> **已完成（2026-07-29）**：已锁定 Playwright `1.62.0`，通过校验官方哈希的任务专用 Windows Node `24.18.0` 以真实 `channel: msedge` 完成 Edge Stable `150.0.4078.105` 的 headed/headless sentinel 门禁；独立 profile、unmanaged policy 分类、sandbox 参数与进程/临时目录清理均验证通过，98 项 preflight、8 项 Vitest、build/typecheck/lint、license、workspace、离线 frozen install 与双重 schema 回归全部通过，且未增加产品功能。

- **背景**：P0-T0C 只证明 direct Edge binary smoke；P0-T1 已建立可固定依赖的 workspace。
- **目标**：只固定 Playwright exact version，并证明真实 Windows Edge Stable `channel: msedge` 的 headed/headless 自动化门禁。
- **本阶段做**：安装/锁定 Playwright；使用临时独立 profile 运行最小 headed/headless fixture；记录 Windows/Edge/Playwright version、channel、policy classification、cleanup 与 evidence hash。
- **本阶段不做**：不实现 selector/protocol/extension，不把 Playwright Chromium 冒充 Edge。
- **实现约束**：不接触用户主 profile；失败分类不可被 direct binary smoke 覆盖；日志去敏。
- **成功路径**：两个要求的启动模式按 ADR 通过，进程/profile 均清理且可重放。
- **失败路径与边界**：channel、policy、display/headed、profile lock、timeout 与 cleanup 分开报告；任一 required 模式失败阻止 P0-T3/P0-T4。
- **建议优先查看/修改的文件**：workspace lockfile、Playwright config、preflight ADR、P0-T0G evidence。
- **测试要求**：exact-version、real `msedge` channel、headed/headless、missing channel、temporary profile、timeout/cleanup、policy classification。
- **验收标准**：正式 Edge channel gate 可复核；未增加产品功能。

## P0-T17A — 两层只读 pilot harness

### Prompt

> **已完成（2026-07-29）**：已交付私有 `@vem/pilot-harness` 的 `VersionedReadOnlyPilotHarness` 与 `CanonicalEvidenceBundleBuilder`；闭合只读输入、Git fixture commit、全量 SHA-256、统一 monotonic-nanoseconds timing、counterbalanced arm、later-holdout exclusion、ground-truth 隔离及 canonical Draft 2020-12 bundle 均 fail closed 验证。8 项目标测试、83 项全仓 Vitest、build/typecheck/lint、roadmap/workspace/license、clean frozen install、production demo 和 98 项 preflight 回归全部通过；本阶段未运行真实 micro-pilot、未产生 P0-VALUE verdict。

- **背景**：micro-pilot 发生在 coordinator/MCP 之前，需要可复核的离线证据通道。
- **目标**：交付 VersionedReadOnlyPilotHarness 和 CanonicalEvidenceBundleBuilder。
- **本阶段做**：读取 task manifest、fixture commit、SelectionSummary、registry snapshot；输出 immutable raw records、canonical JSON bundle、schema validation 和摘要。
- **本阶段不做**：不运行实际 3–5 task verdict，不写 fixture/source，不联网搜索，不调用 coordinator/MCP。
- **实现约束**：输入全量 hash；canonical serialization；统一计时边界；later holdout exclusion；路径/文本隐私过滤。
- **成功路径**：同一输入重复得到相同 bundle content hash，Codex 只需消费 bundle。
- **失败路径与边界**：输入变更、ground truth 缺失、arm timing 不同、holdout 重用、写操作尝试均 fail closed。
- **建议优先查看/修改的文件**：`benchmarks/golden-tasks/`、`scripts/pilot/`、protocol schema、`docs/test-evidence/P0-T17/`。
- **测试要求**：read-only enforcement、canonical JSON、hash tamper、redaction、clock unit、holdout exclusion。
- **验收标准**：能生成固定 JSON evidence bundle，但不产生产品价值结论。

## P0-T2 — REQ-TRACE-001 repository validator

### Prompt

> **已完成（2026-07-29）**：已交付 requirements schema v4 与 `pnpm roadmap:validate`，支持向后兼容的单文件 heading 和正式 `{path, anchor}` 多文件 authority；11 组 fixtures 覆盖未知 contract、未覆盖规范、缺测试、broken link、孤立映射、环、decision 与状态矛盾。真实 9 phase/136 task/25 contract 仓库验证、19 项 Vitest、98 项 preflight、build/typecheck/lint/license/workspace 与离线 clean install 全部通过。

- **背景**：bootstrap 目前依赖一次性 inline 检查，且 contract authority 仍隐含使用单一 `design_source + heading`；ROADMAP 已要求可重复的仓库 validator。
- **目标**：交付本地可运行的 roadmap/requirements validator，机械验证规范覆盖、双向 contract/task 映射、多文件 `path + stable anchor` authority、内部链接、依赖 DAG、decision attempt/verdict 与 task/phase 状态一致性。
- **本阶段做**：升级 requirements authority schema；实现 validator CLI/core；提供 valid 与 fail-closed fixtures；加入 `pnpm roadmap:validate`。
- **本阶段不做**：不运行 CI、不移动规范正文、不实现产品协议、浏览器、selector、runtime 或 production leakage gate。
- **实现约束**：路径必须 root-relative 且不可逃逸；anchor 精确且唯一；heading own-body 规范词覆盖；未知字段/contract/task/decision/status、孤立映射、环与 broken link 均失败。
- **成功路径**：真实仓库和 valid fixture 通过；每类无效 fixture 返回稳定分类与非零退出；现有 workspace/preflight 回归保持通过。
- **失败路径与边界**：parse/schema、authority、coverage、mapping、dependency、decision、state 或 link 任一错误阻止完成；validator 不修复输入。
- **建议优先查看/修改的文件**：`docs/requirements.yaml`、`ROADMAP.yaml`、`scripts/roadmap/`、root package scripts、P0-T2 evidence。
- **测试要求**：valid、multi-source path/stable anchor、unknown contract、uncovered normative section、missing test map、broken link、orphan task、cycle、decision reference/attempt/verdict、inconsistent task/phase state。
- **验收标准**：`pnpm roadmap:validate` 可重复通过并覆盖规定的负向 fixtures；只交付 governance validator，不增加产品功能。

## P0-T3 — MCP compatibility 与最小协议基线

### Prompt

> **已完成（2026-07-29）**：已由 owner 接受 ADR 0004，锁定 primary MCP `2025-06-18`、compat `2025-03-26`/`2025-11-25`、`@modelcontextprotocol/sdk@1.30.0` 与 P0 no-Tasks 边界；交付严格 TypeScript/闭合 Draft 2020-12 schema、RevisionContext、单次 ConfirmationBinding、PRIV-MIN、VemError、最小 EvidenceGraph、真实 Codex 初始化矩阵及兼容性测试。31 项 Vitest、7 项 workspace、98 项 preflight、build/typecheck/lint/license/roadmap 与离线 frozen install 全部通过，未宣称 runtime capability。

- **背景**：P0-T0G 已通过真实 Edge channel gate；当前需在产品实现前冻结 P0 walking skeleton 的协议、revision、evidence、privacy 与 confirmation 语义。
- **目标**：记录 primary/compat MCP revision 与 Tasks negotiation 决策，并交付 strict TypeScript types、closed JSON Schema、compatibility matrix 和 contract tests。
- **本阶段做**：锁定 production MCP SDK；记录 Codex client initialization 证据；定义 ProjectRevisionContext/RevisionContext、ConfirmationBinding、PRIV-MIN bounded summary、VemError、minimum EvidenceGraph 与 task/no-task negotiation envelope。
- **本阶段不做**：不启动 MCP server/coordinator，不实现 selector、Vite transform、claim storage、confirmation lifecycle、source resolver、wait journal 或产品工具 handler。
- **实现约束**：运行时只使用明确协商 revision；核心闭环不依赖 Tasks；experimental Tasks 与 extension wire shape 不混用；所有外部 schema closed 且有 size/depth/array bound；冲突优先于 confidence；输出默认去敏。
- **成功路径**：ADR/decision、types/schema/matrix 一致；primary/compat/no-task/optional-task、revision identity、direct/degraded confirmation、privacy、error、EvidenceGraph 与 schema bounds fixtures 全部通过。
- **失败路径与边界**：缺 owner decision、初始化证据不足、SDK/revision 漂移、unknown property、oversize、stale identity、trust laundering、隐私泄漏或 task capability 假设均阻止完成。
- **建议优先查看/修改的文件**：`docs/adr/`、`docs/decisions/OPEN_DECISIONS.yaml`、`packages/protocol/`、P0-T3 evidence、workspace lockfile/notices。
- **测试要求**：ADR lint、contract IDs、primary/compat initialization、no-task、optional-task negotiation refusal、revision equality/reset、confirmation direct/degraded、schema size/depth、privacy output、EvidenceGraph conflict 与 VemError compatibility。
- **验收标准**：P0-T3 协议规格可被后续 P0-T12A/B/C 实现消费，但本阶段不宣称任何 runtime capability。

## P0-T4 — React/Vite 隐私与恶意输入 fixture

### Prompt

> **已完成（2026-07-29）**：已锁定 React/React DOM `19.2.8`、Vite `8.1.5` 与 plugin-react `6.0.4`，交付 private React/Vite demo、9 类闭合 malicious fixture、表单/private subtree/敏感 URL 与 title/prompt injection/Unicode-control/假 secret/error echo/unknown payload；React SSR 证明注入 HTML 被转义，真实 Vite build 为 17 modules/4 files/1,053,984 bytes 且无外部请求。37 项源测试、7 项 workspace、98 项 preflight、build/typecheck/lint/license/roadmap 与离线 frozen install 全部通过，未实现或宣称任何产品 runtime。

- **背景**：协议的 PRIV-MIN 基线已冻结，但 selector/proxy/MCP 实现前还缺一个可构建、可重复的真实 React + Vite 恶意输入场景。
- **目标**：交付固定版本的 React/Vite/TypeScript demo，覆盖私有表单、private subtree、URL secret、prompt injection、超长 Unicode/control character、secret-shaped diagnostics 与错误回显语料。
- **本阶段做**：建立 private demo workspace package；将恶意内容作为显式 untrusted fixture data 渲染；提供闭合 fixture manifest、SSR smoke tests 和真实 Vite production build。
- **本阶段不做**：不实现 selector、隐私投影、proxy、MCP、Vite marker transform、source registry、浏览器自动化或 production leakage verdict。
- **实现约束**：所有 secret 均为显式假值；不访问外部网络；prompt injection 只作为 React 文本节点；fixture ID/category 稳定；表单当前值、query/fragment、原始敏感 path/title、private subtree 和错误回显必须真实存在于 fixture，供后续 fail-closed 测试消费。
- **成功路径**：React SSR 可枚举全部预登记 fixture；恶意 HTML 被转义；Vite build 成功；fixture manifest 与页面结构一致。
- **失败路径与边界**：缺任一 PRIV-MIN 类别、使用真实 credential、执行注入内容、外部请求、unknown fixture category、未闭合 manifest 或 demo build 失败均阻止完成。
- **建议优先查看/修改的文件**：`packages/demo-fixture/`、workspace/tsconfig、root demo scripts、P0-T4 evidence。
- **测试要求**：demo build、private input/textarea/select/password、`data-vem-private` 与用户 private selector、URL path/query/fragment、prompt-data escaping、long Unicode/control text、secret/error echo、closed manifest smoke tests。
- **验收标准**：fixture-only demo 可被 P0-T5/P0-T15 复用且全部门禁通过；本阶段不声称任何隐私过滤或产品 runtime capability。

## P0-T5 — Injected selector、PRIV-MIN projection 与 ephemeral lifecycle

### Prompt

> **已完成（2026-07-29）**：已接受 ADR 0005 并交付 `@vem/injected-selector`：pointer-free closed-shadow overlay、合并 hover/click/Escape、private/hidden/tool target 拒绝、不可变有界 PRIV-MIN summary、始终 page-untrusted provenance、严格 external-confirmation-required 与 memory-only 全生命周期清理；React/Vite fixture 已接入。50 项源测试、7 项 workspace、真实 23-module/4-file/1,092,648-byte/0-external-URL build、231-package license、98 项 preflight、build/typecheck/lint/roadmap 与 frozen install 全部通过，未宣称源码定位、MCP、持久化或编辑授权。

- **背景**：恶意 React/Vite fixture 已可构建，当前需交付 P0 第一条真实 injected-page selection，同时保持页面环境和交互声明始终不可信。
- **目标**：记录 injected-browser/SEL-PROV ADR，并实现最小 selector overlay、page-untrusted SelectionSummary、PRIV-MIN allowlist projection、strict external-confirmation limitation 与 memory-only lifecycle。
- **本阶段做**：提供 injected-page capability report；实现 hover/click/Escape、overlay-owned filtering、private target refusal、bounded/redacted summary、untrusted prompt-data 标记、内存 selection store 及 document/project/pagehide/explicit clear。
- **本阶段不做**：不实现 source anchor/registry、proxy/coordinator/MCP、claim/ConfirmationBinding 消费、Vite injection plugin、扩展/CDP、截图、持久化或真实 prepared edit。
- **实现约束**：`event.isTrusted`、同源、overlay 与 nonce 均不得提升 integrity；不读取表单 current value；`data-vem-private`/用户 private selector 整棵拒绝；URL 仅 origin + redacted path；文本去 control/限长并标记 untrusted；严格编辑始终返回 external-confirmation-required。
- **成功路径**：真实 DOM fixture 可启动/停止 selector、hover overlay、点击产生 immutable bounded summary；普通按钮可选，私有/不可见/工具节点拒绝；所有生命周期 clear 后 handle/snapshot 不可恢复。
- **失败路径与边界**：敏感值/query/fragment/raw path/error echo 泄漏、trust laundering、未知 selector、oversize summary、stale project/document 或 cleanup 残留均阻止完成。
- **建议优先查看/修改的文件**：`packages/injected-selector/`、`packages/demo-fixture/`、ADR、P0-T5 evidence。
- **测试要求**：ADR/contract IDs、capability boundary、target/overlay/filter、page-untrusted provenance、strict external confirmation、form/private/URL/Unicode/prompt/error projection、summary bound、pagehide/document/project/explicit clear。
- **验收标准**：P0-T5 提供可供后续 transform/pilot 使用的最小 injected selector，但不宣称受信任用户手势、源码定位、MCP 或修改授权。

## P0-T15 — Serve-only intrinsic JSX source anchor 与生产不参与

### Prompt

> **已完成（2026-07-29）**：已接受 ADR 0006 并交付 `@vem/vite-plugin`：固定 React 19/Vite 8/Oxc 矩阵、serve-only/pre intrinsic JSX transform、spread 后 opaque `vem1_` anchor、高精度 sourcemap、Fast Refresh、collision/revision/1 MiB private memory registry 门禁；production 配置前后 module graph/字节/source map/SSR 行为等价且用户同名/广义 data 属性保留。62 项源测试、7 项 workspace、真实 23-module/4-file/1,092,834-byte build、0 VEM-owned signature、235-package license、98 项 preflight 与全部 workspace gate 通过，未实现 publication、lookup、client、endpoint、Coordinator 或 MCP。

- **背景**：P0 已有恶意 React/Vite fixture 和 page-untrusted selector，但尚无可验证的 host source anchor；任何 dev marker 必须在引入的同一阶段证明生产构建完全不参与。
- **目标**：接受 source-anchor/PROD-LEAK ADR，并为固定 React 19 + Vite 8 Oxc 矩阵交付 serve-only intrinsic JSX transform、opaque anchor 与 private in-memory registry output。
- **本阶段做**：锁定 Node/Vite/React/plugin/parser/transform matrix；只处理项目内 `.jsx/.tsx` intrinsic JSX；定义 namespaced hash、AST path、component/location/revision registry record；检测保留属性冲突；返回高精度 sourcemap；将插件以 `apply: serve` 接入 demo。
- **本阶段不做**：不发布 registry 到 Coordinator，不实现 lookup/source resolution、runtime owner/usage、HMR revision、client/endpoint/HTML injection、MCP、production scanner CI 或跨框架支持。
- **实现约束**：VEM transform 必须在 React transform 前执行；generated marker 位于 spreads 之后且用户显式保留属性 fail closed；自定义组件不注入；跳过 node_modules/虚拟模块/项目外路径；build hook、registry publication、client 与 endpoint 在 production build 中不执行或解析；不写 `src/public/dist`。
- **成功路径**：automatic/classic JSX、nested component/AST path、spread、Fast Refresh 与 sourcemap fixture 产生确定且 collision-checked anchor；同一 production fixture 在未启用与配置 VEM 两种状态下 module graph/HTML/JS/CSS/assets/行为字节等价，用户广义及同名属性保留。
- **失败路径与边界**：保留属性冲突、parser error、无 sourcemap、插件顺序错误、项目外/已转换输入、hash collision、production transform/resolve/publication、产物 signature、registry 项目落盘或 baseline drift 均阻止完成或返回明确 limitation。
- **建议优先查看/修改的文件**：`packages/vite-plugin/`、`packages/demo-fixture/`、source-anchor ADR、P0-T15 evidence、workspace lock/notices。
- **测试要求**：ADR/matrix、intrinsic/custom/spread/reserved attribute、deterministic hash/collision、component/AST path/location、sourcemap chain、automatic/classic/Fast Refresh、scope skip、serve/build separation、private registry、module-graph/baseline equivalence、readonly leakage 与 user-attribute preservation。
- **验收标准**：P0-T15 只交付固定矩阵内的 dev source-transform 与 private registry output，并机械证明 production non-participation；不宣称 registry publication、source lookup、browser injection 或 MCP 能力。

## P0-T16 — Revision-scoped source registry publication 与 lookup prototype

### Prompt

> **已完成（2026-07-29）**：已交付 private `@vem/source-registry` 内存原型，原子、幂等发布 P0-T15 immutable snapshot，并仅在 project/build/source revision、sequence、transform compatibility、规范相对路径、anchor identity hash 与当前 membership 全部匹配时返回单一 `registry-matched` direct source；旧 revision 仅保留一代诊断且 lookup 明确 stale。13 项目标测试、75 项源码测试、7 项 workspace 测试、build/typecheck/lint、生产无泄漏 build、roadmap/license/frozen install 与 98 项 preflight 全部通过；未加入 transport、MCP、源码读取、候选、重附着或持久化。

- **背景**：P0-T15 已产生 collision-checked transform records，但 registry 仍标记为未发布/不可查询；pilot 前需把 opaque marker 与同 revision registry membership 机械绑定。
- **目标**：实现内存、revision-scoped、原子 publication/lookup prototype，使当前 marker 只有在 project/build/source registry revision 与 membership 一致时才返回 direct registry-matched host anchor。
- **本阶段做**：定义闭合 publication/lookup types；消费 P0-T15 immutable snapshot；验证 ProjectRevisionContext、exact transform compatibility、relative source location、record/revision/hash uniqueness；生成 coordinator-side opaque relative-file identity 与 direct evidence hash；保留当前及必要前一 revision 诊断状态。
- **本阶段不做**：不实现 Coordinator transport/discovery、browser ingress、MCP tools/resources、源码读取、heuristic candidate、跨 revision successor/reattachment、HMR transaction、持久化或页面路径暴露。
- **实现约束**：build/source registry revision 仅相等比较；project restart 不跨实例排序；同 revision 不同内容为 collision；publication 原子且幂等；旧 revision lookup 始终 stale，前一 revision 只供诊断；相同 anchor string 不得跨 registry 解释；relative path 必须 POSIX/project-relative/no traversal；不从页面输入派生文件 identity。
- **成功路径**：兼容 publication 成功且重复 publish 幂等；当前完整 ProjectRevisionContext + anchor membership 返回单一 direct result、原始相对位置、opaque file identity、registry-matched evidence hash；新 revision 发布后旧 lookup 明确 stale。
- **失败路径与边界**：revision/context mismatch、同 revision digest collision、duplicate anchor/path traversal、unsupported transform、oversize publication、missing anchor、stale project/revision/sequence 或 previous-revision lookup 被升级为 current 均 fail closed。
- **建议优先查看/修改的文件**：`packages/source-registry/`、`packages/vite-plugin/` types、P0-T16 evidence、workspace references。
- **测试要求**：valid/idempotent publication、revision collision、project reset、source/build/sequence stale、relative location/file identity、transform compatibility、duplicate/missing anchor、previous retention/no lookup、atomic failure、closed bounds 与 no persistence/transport。
- **验收标准**：P0-T16 交付可供只读 pilot harness 使用的当前 revision direct membership lookup，不宣称跨 revision reattachment、Coordinator/MCP transport、源码内容读取或修改授权。

## P0-T17B — 3–5 task value micro-pilot

### Prompt

- **背景**：harness 已冻结输入和计时语义，现需比较 direct-search 与 VEM-assisted 两个 arm。
- **目标**：执行预登记任务并给出 continue/adjust/stop verdict。
- **本阶段做**：在看结果前提交 plan/threshold；每个 arm 使用全新 Codex conversation/context，随机或交叉平衡 arm 顺序，并让 ground truth 对参与路径不可见；保存 raw hashes、一次性 setup cost、per-task cost、top-k、wrong attribution 和人工纠正。
- **本阶段不做**：不调整 harness/candidate scoring，不替换 task，不消费后续 holdout，不发表百分比产品宣传。
- **实现约束**：Codex 只消费 bundle；ground truth 预先冻结且 withheld；两个 arm 使用相同 prompt、fixture、权限、timing 和 cache policy；wrong attribution 直接触发 adjust/stop。
- **成功路径**：所有记录完整且满足预登记 continue 条件。
- **失败路径与边界**：bundle hash 变化、计时违规、错误归因或 setup cost 超标必须如实 verdict。
- **建议优先查看/修改的文件**：P0-T17 evidence plan/bundles/summary、`docs/progress.md`、`ROADMAP.yaml`。
- **测试要求**：plan immutability、task pairing、raw-hash validation、verdict calculation、later-holdout untouched。
- **验收标准**：任务完成后设为 `status: done` 并记录非 pending `decision`；只有 `decision: continue` 允许 P0-T7，adjust/stop 时后续投资暂停。

> **已完成（2026-07-29）**：已按预登记哈希 `2bf456e2220cf61fb78c97c1854d6575847d783b66404ba3db3746380573b1bb` 执行 5 个任务、10 个全新临时只读 Codex context；10/10 定位正确、10 个 thread ID 唯一、VEM direct-primary 5/5、wrong attribution/reselection/operator correction 均为 0，canonical bundle 哈希为 `d7eaabf23afd3456c7adbd4cf9f1abd6c381c69149d7650b5ac9b361c642f65e`。VEM 仅 2/5 配对更快，约 39.21 秒的中位定位时间高于 direct 的约 30.37 秒，且节省未覆盖 setup cost；依照事前规则如实记录 `decision: adjust`，不作百分比产品声明、不授权 P0-T7，并保留 attempt 1 原始 evidence。

## P0-T17C — Participant capsule 与 equal-base-context remediation

### Prompt

- **背景**：P0-T17B attempt 1 的正确性和零错误归因门槛通过，但时间/成本门槛得到 `adjust`；原始事件还显示 VEM arm 可能发现并读取 repo-local visual UI skill，participant workspace 位于 evidence/repository 树内，增加了与 direct arm 无关的上下文开销。
- **目标**：只修复 micro-pilot participant 执行环境，使两个 arm 的基础上下文、可见文件和规则发现边界一致，唯一预期 treatment 差异是 VEM arm 的固定 `vem-context.json`。
- **本阶段做**：在 repository/evidence 树外创建任务专用 capsule；固定模型、prompt、fixture、工具权限、timing/cache；阻止或 fail closed 检测 repo rule/skill 与 capsule 外路径读取；验证 ground truth/holdout 不进入 participant context；保存 capsule manifest/hash 与正负 probe。
- **本阶段不做**：不执行 attempt 2，不修改 source-anchor/registry/selector 产品映射，不改 attempt 1 evidence，不调低 threshold，不替换任务或消费 later holdout。
- **实现约束**：不得复制 auth/token、ground truth 或用户配置到 evidence；任何 observed command path 越出 capsule、非 treatment 文件差异、repo-local skill/rule 注入或隔离不可证明都必须失败。
- **成功路径**：direct/VEM probe 具有相同基础 system/rule/tool/fixture manifest，只有 VEM context 文件不同；两个 probe 均不能读取/搜索 evaluator-only records。
- **失败路径与边界**：仅依靠 prompt 要求“不要读取”不算隔离；无法证明 capsule 边界时保持 blocked，不运行新 attempt。
- **建议优先查看/修改的文件**：`scripts/pilot/`、P0-T17B raw event evidence、新 capsule tests/evidence、roadmap/progress。
- **测试要求**：outside-repo capsule、equal-base-context、intended-difference allowlist、repo rule/skill leak、command-path escape、ground-truth/holdout isolation、hash/cleanup 和 fail-closed negative probes。
- **验收标准**：独立 capsule remediation 通过后设为 `done`，仅使 P0-T17D eligible，不直接改变 `P0-VALUE` verdict。

> **已完成（2026-07-29）**：已交付 repository 外、Bubblewrap 只读 participant capsule，保留内层 Codex `read-only` sandbox；5 对 task manifest 具有同一 base-context hash，唯一 treatment 差异为各自 `vem-context.json`。10 次真实 filesystem probe 和 10 次 capsule 内 `codex-cli` binary probe 均证明 repository、home、rules、skills、ground truth、holdout 与 control metadata 不可见；command/stdout/stderr 的 capsule 外绝对路径和 skill/rule marker 均 fail closed，auth 仅允许运行时只读挂载且不复制/记录，cleanup 残留为 0。5 项 capsule 测试、93 项全仓 Vitest、build/typecheck/lint、roadmap/workspace/license、clean frozen install、production demo 与 98 项 preflight 回归通过；本阶段未执行 attempt 2、未改变 `P0-VALUE`。

## P0-T17D — P0-VALUE attempt 2

### Prompt

- **背景**：attempt 1 的 `adjust` 与原始 evidence 不可覆写；participant capsule remediation 已独立通过。
- **目标**：以新的 immutable evidence plan 执行 `P0-VALUE` attempt 2，给出新的 continue/adjust/stop verdict。
- **本阶段做**：在结果前冻结 attempt 2 task/threshold/capsule/runner hashes；使用全新 Codex context、交叉平衡顺序和相同基础条件执行 direct/VEM；明确披露 attempt 1 task 的 retest 身份，保持 later holdout 未使用；保存 raw hashes、setup/per-task cost、正确性和隔离 audit。
- **本阶段不做**：不覆盖 attempt 1，不根据局部结果改 runner/prompt/threshold，不把 later holdout 当重试集，不发表百分比产品宣传。
- **实现约束**：`decision_attempt: 2`、`supersedes_attempt: P0-T17B`；任何 capsule escape、rule/skill leak、输入变化、wrong attribution 或 holdout 污染均 fail closed。
- **成功路径**：所有完整性/正确性/成本门槛满足预登记 continue 条件。
- **失败路径与边界**：不达标如实 adjust/stop；不得以 attempt 1 与 attempt 2 合并平均制造 continue。
- **建议优先查看/修改的文件**：P0-T17C capsule evidence、attempt 2 plan/bundles/summary、`ROADMAP.yaml`、`docs/progress.md`。
- **测试要求**：attempt-chain immutability、new-plan hash、fresh contexts、counterbalance、equal-base-context audit、raw/result hash、verdict recomputation、later-holdout untouched。
- **验收标准**：任务完成后设为 `done` 并写入非 pending verdict；只有 attempt 2 `decision: continue` 才允许 P0-T7。

> **已完成（2026-07-29）**：owner 明确授权的第二批 10 次外部 arm 已在冻结的 attempt 2 plan/capsule/runner 下执行，10/10 结构化响应正确、5/5 VEM direct-primary match、0 wrong attribution，且 fresh thread、counterbalance、later-holdout exclusion 与 raw/result hash 均通过。VEM 仅 2/5 配对更快，direct/VEM 中位时间约 41.99/44.21 秒，三个预登记成本条件均未满足；fail-closed capsule audit 另有 7/10 run 触发 `CAPSULE_COMMAND_PATH_ESCAPE`，故 immutable verdict 为 `P0-VALUE=stop`，canonical bundle 哈希为 `80b08ac28f248addc1b1f1af13bc6f4678e5d63836e6a55ad8ca5cbd700c508d`。P0 phase 已失败，P0-T7 不再 eligible。

## P0-T17E — Terminal-stop 后的 capsule audit remediation

### Prompt

- **背景**：P0-T17D 的 immutable `stop` 已使 P0 failed；后验只读分析发现 7 个 `CAPSULE_COMMAND_PATH_ESCAPE` 来自 legacy auditor 把 route `/`、JSX `/>` 和 `/projects/:projectId` 数据误当绝对文件路径。
- **目标**：在不修改 bound legacy runner/auditor、attempt 2 evidence 或 verdict 的前提下，交付版本化 post-hoc audit 与可复核 replay evidence。
- **本阶段做**：新增独立 v2 auditor；区分 command absolute-path tokens、结构化 command output path lines 与普通源码/JSON 数据；保留 forbidden marker 和真实 capsule 外路径 fail-closed；对全部 attempt 2 raw streams 重放并保存 canonical hash。
- **本阶段不做**：不重跑外部 arm、不创建 decision attempt 3、不覆盖 `P0-VALUE=stop`、不改变 P0 failed、不解锁 P0-T7/P1。
- **实现约束**：legacy `scripts/pilot/capsule.mjs` 和 active attempt 2 目录保持 byte-for-byte 不变；v2 不得通过忽略所有 output 或扩大路径 allowlist 消除误报；post-hoc evidence 必须明确 non-authoritative。
- **成功路径**：attempt 2 的 10 个 raw stream 经 v2 均无 observed escape；route/JSX/source JSON 不误报；真实 `/home`、`/root`、`/mnt`、repo rules/skills 与非 allowlist absolute path 仍失败。
- **失败路径与边界**：任何 raw/result hash 变化、legacy hash 变化、无法区分的 path-like token 或真实 forbidden marker 都使 remediation 失败；不改变 terminal verdict。
- **建议优先查看/修改的文件**：新增 `scripts/pilot/capsule-audit-v2.mjs`、对应 tests/replay、P0-T17D sibling evidence、roadmap/progress。
- **测试要求**：legacy immutability、route `/`、JSX `/>`、parameterized route、command/output/stderr actual escape、forbidden marker、malformed JSONL、bounded input、attempt-two replay 与 verdict/phase immutability。
- **验收标准**：v2 tests、attempt 2 replay、全仓门禁通过后设为 `done` 并在本 Prompt 下标注完成；P0 与 P0-VALUE 状态保持 failed/stop。

> **已完成（2026-07-29）**：已新增独立、版本化 capsule audit v2 与 immutable attempt 2 replay；保留 legacy capsule/runner 哈希 `13a92a…956` / `25f762…46ae`，没有修改 P0-T17D raw/result evidence。v2 正确忽略 route `/`、JSX `/>` 与 parameterized route data，对 10/10 原始 stream 通过，同时 command、structured output、stderr 的真实 `/home`、`/root`、`/mnt` escape 及 rule/skill marker 继续 fail closed。5 项目标测试、103 项全仓 Vitest、build/typecheck/lint、139-task roadmap、workspace/license、clean frozen install、production demo、98 项 preflight 与 evidence hashes 均通过；active replay 哈希为 `48f3c70db5c471e2b1b94d1c18730f0a60e51b730182ec5ade4b89a563b789d7`。该 evidence 明确 non-authoritative，`P0-VALUE=stop` 与 P0 `failed` 保持不变，未解锁 P0-T7/P1。

## P0-T17F — Terminal-stop 后的 timing forensics

### Prompt

- **背景**：P0-T17E 已解释并修复 audit false positive，但 P0-T17D 仍独立未达到成本门槛：VEM 仅 2/5 pair 更快且 median 较慢。
- **目标**：只从 immutable attempt 2 run/event evidence 生成有界、可复算的 timing forensics，区分已观察事实与无法归因的阶段。
- **本阶段做**：重算每个 run 的 monotonic duration；核对 canonical verdict metrics；提取 arm order、command count、reported input/cached/output/reasoning tokens 与 command-output bytes；生成 paired/order-stratified summary 和 canonical evidence hash。
- **本阶段不做**：不重跑模型、不把 event 顺序冒充 event timestamp、不跨 attempt 合并平均、不推断模型或 VEM 的因果性能、不修改 threshold/verdict/phase、不启动产品任务。
- **实现约束**：P0-T17D 与 active P0-T17E evidence/source bindings 保持不变；所有整数以 decimal string 保存，避免 nanosecond 精度损失；缺失/重复 turn、command completion 或 run/trial mismatch 必须失败。
- **成功路径**：10 run/5 pair 的 duration 与 verdict 完全一致，order/usage/command 指标可从 raw JSONL 重放，明确列出可观察结论与 `NO_EVENT_TIMESTAMPS` 等限制。
- **失败路径与边界**：任何 hash、duration、thread、arm order 或 canonical metric 不一致即失败；不得用相关性或 5-task smoke 宣称普遍性能原因。
- **建议优先查看/修改的文件**：新增 `scripts/pilot/analyze-p0-t17d-timing.mjs`、tests、P0-T17F evidence、roadmap/progress。
- **测试要求**：evidence immutability、duration precision、pair mapping、median/faster count agreement、usage bounds、malformed/missing/duplicate event、order summary、canonical hash、non-causal limitations 和 terminal-state preservation。
- **验收标准**：目标/全仓测试与 evidence hashes 通过后设为 `done` 并在本 Prompt 下标注完成；`P0-VALUE=stop`、P0 failed 和后续 task locks 不变。

> **已完成（2026-07-29）**：已从 immutable attempt 2 的 10 个 run/event stream 精确重算 duration，并与 canonical verdict 的 direct/VEM median `41,985,459,470 / 44,209,203,458 ns` 及 VEM faster `2/5` 完全一致。VEM/direct 分别执行 9/11 个 command、两边各有 1 个已恢复的非零 command；第二 arm 仅 3/5 更快，不能解释 arm 差异。reported token/cache/output bytes 已有界记录，但 raw event 没有逐事件 timestamp，故报告明确结论为无法把 total duration 归因给 command、cache 或 model phase。5 项目标测试、108 项全仓 Vitest、build/typecheck/lint、140-task roadmap、workspace/license、clean frozen install、production demo、98 项 preflight 和 evidence/source hashes 全部通过；active report 哈希为 `664d8e49e0fdb573944aadc14b0affbcfae1fa0f3cc2db4c7104dc8f9eac5afc`。本报告 non-authoritative/non-causal，不跨 attempt pooling，`stop/failed` 与后续锁定不变。

## R0-T1 — Independent recovery charter 与 no-product-unlock validator

### Prompt

- **背景**：P0-T17D terminal stop 与 P0 failed 不可覆盖；owner 已明确授权新增一个独立恢复研究阶段。
- **目标**：固定 R0 recovery charter，并机械证明它不能解锁或成为既有 P0/P1–P8 产品依赖链的一部分。
- **本阶段做**：增加 R0-RECOVERY-001 规范、独立 decision key、owner authorization record、R0-T1–T4 原子链与 validator recovery-boundary checks。
- **本阶段不做**：不实现 timing ledger、不冻结 task bank、不调用外部模型、不修改 P0 verdict/phase、不实现产品能力。
- **实现约束**：R0 `depends_on: []`、`recovery_of_failed_phase: P0`、`does_not_supersede: P0-VALUE`；任何既有 task/phase 依赖 R0 都必须 fail closed。
- **成功路径**：validator 接受 owner-authorized independent R0，拒绝 recovered phase 非 failed、R0 phase dependency、缺失/错误 decision separation 和 product dependency leakage。
- **失败路径与边界**：不能通过给 P0 标 passed、把 stop 改 adjust/continue、让 P1 改依赖 R0 或删 decision gate 制造可执行性。
- **建议优先查看/修改的文件**：`docs/DESIGN.md`、`ROADMAP.yaml`、`docs/requirements.yaml`、roadmap validator/tests、decision/delivery/progress 文档。
- **测试要求**：valid recovery、failed-phase requirement、empty phase deps、authorization ref、decision isolation、phase/task leakage、bidirectional contract mapping、full roadmap gates。
- **验收标准**：charter 与 validator checks 全部通过后设为 `done` 并标注完成；下一项仅为 R0-T2。

> **已完成（2026-07-29）**：已记录 owner 对独立 R0 recovery research 的明确授权，新增 `R0-RECOVERY-001`、独立 `R0-RECOVERY` decision chain、R0-T1–T4 原子序列与 delivery charter；P0-T17D `done/stop` 和 P0 `failed` 保持不变。Validator 现机械拒绝 recovered phase 非 failed、R0 phase dependency、缺失 authorization、decision 混链以及既有 phase/task 对 R0 的依赖泄漏，证明 product unlock count 为 0。14 项 validator 测试、2 项 charter proof 测试、113 项全仓 Vitest、build/typecheck/lint、10-phase/144-task/26-contract roadmap、workspace/license、clean frozen install、production demo 与 98 项 preflight 全部通过；本阶段没有外部模型调用或产品能力实现。下一项仅为 R0-T2。

## R0-T2 — Trusted monotonic event-receipt timing ledger

### Prompt

- **背景**：P0 raw events 没有逐事件 timestamp，无法解释 total duration。
- **目标**：交付所有 arm 共用的 trusted outer-runner monotonic receipt ledger。
- **本阶段做**：定义并实现 process/event/final-response receipt schema、canonical hash、bounds、clock domain、cancellation/terminal completeness。
- **本阶段不做**：不创建 recovery tasks、不执行外部 pilot、不声称 model-server 或 shell-internal timing。
- **实现约束**：decimal-string nanoseconds；raw event hash 与 ledger entry 一一对应；缺失、倒序、重复 terminal 或 instrumentation drift fail closed。
- **测试要求**：process lifecycle、event receipt、final response、monotonic order、schema/size、raw hash、cancel/error、missing/duplicate terminal。
- **验收标准**：实现与目标/全仓门禁通过后 `done`，使 R0-T3 eligible。

> **已完成（2026-07-29）**：已交付版本化 `TrustedReceiptLedger`，用 trusted outer-runner 的 `process.hrtime.bigint` 记录 process spawn、JSONL event receipt、structured final response、stderr、cancellation 与 process exit；纳秒和 byte counts 均为 decimal string，原始内容只保留 SHA-256，canonical evidence 带 instrumentation hash、clock domain、bounds、完整终态及明确的 non-attribution limitations。真实本地 Node 子进程证明封存 8 个单调收件点并成功终止，ledger hash 为 `6171f65f06ca494a4eb274b1b34c81526a492254dd680475eb969adc55a5fd45`。9 项定向测试、123 项全仓 Vitest、build/typecheck/lint、10-phase/144-task/26-contract roadmap、workspace/license、clean frozen install、production demo 与 98 项 preflight 全部通过；没有外部模型调用、产品实现或 P0 verdict 变更。下一项仅为 R0-T3。

## R0-T3 — Recovery-only task bank 与 preregistration

### Prompt

- **背景**：R0-T2 提供可信 runner-observed timing，但尚无新的 recovery-only evaluation plan。
- **目标**：冻结未用于 P0 attempt 1/2、也不消费产品 holdout 的 recovery-only task bank 和 evidence plan。
- **本阶段做**：固定 task/prompt/fixture/capsule/instrumentation/threshold hashes、fresh-context/counterbalance/cache policy 与 separate setup cost。
- **本阶段不做**：不执行外部 arm、不改 threshold、不把 recovery tasks 宣称为产品 holdout。
- **实现约束**：ground truth evaluator-only；direct/VEM 唯一 treatment 差异；later holdout untouched；外部发送前另取 owner 授权。
- **测试要求**：task identity、input hashes、equal base context、counterbalance、threshold、ledger binding、holdout exclusion、pre-result immutability。
- **验收标准**：preregistration frozen 且 dry-run/probes 通过后 `done`；R0-T4 等待外部调用授权。

> **已完成（2026-07-29）**：已冻结 5 个从未用于 P0 attempt 1/2、也不属于 P1/P3/P4 product holdout 的 recovery-only tasks，共 10 个 counterbalanced arms；每对 arm 的 prompt、fixture、tool、sandbox、fresh tmpfs Codex home 与 base-context hash 相同，唯一 treatment 差异为 VEM arm 的 `vem-context.json`。预注册固定 future runner、capsule、v2 auditor、receipt ledger 的 8 个 source hashes、correctness/wrong-attribution/capsule/ledger/cost/no-benefit 阈值及 separate setup cost；10 次 filesystem isolation 与 10 次 `codex --version` capsule probe 全部通过。7 项 R0-T3 定向测试、130 项全仓 Vitest、build/typecheck/lint、10-phase/144-task/26-contract roadmap、workspace/license、clean frozen install、production demo 与 98 项 preflight 全部通过。预注册哈希为 `57fb4b9b033e61eb4e0b4b9a0f14ced28064b6fb17d73f5e7ae60552d0f37359`，instrumentation hash 为 `c7851c93a8451436d056cc9b2ed097e4b0fc5c6cc0e9f7289ec22ff710d4067b`，且 `externalExecutionAuthorized=false`；本阶段没有调用外部模型。R0-T4 必须取得绑定该预注册哈希的单独 owner 授权后才可开始。

## R0-T4 — Independent recovery micro-pilot verdict

### Prompt

- **背景**：R0-T3 已冻结 plan；R0-T4 是独立 decision chain 的 attempt 1。
- **目标**：执行 recovery-only paired arms，并记录 `R0-RECOVERY=continue|adjust|stop`。
- **本阶段做**：在单独 owner 授权后执行 fresh contexts，保存 raw/ledger/result hashes、correctness、wrong attribution、capsule integrity 和 cost verdict。
- **本阶段不做**：不覆盖 P0 evidence、不合并 P0/R0 平均、不自动创建后续 phase、不解锁 P0-T7/P1。
- **实现约束**：任何输入/ledger/capsule/ground-truth/holdout integrity 失败均 fail closed。
- **测试要求**：fresh contexts、ledger completeness、raw hashes、correctness、wrong attribution、cost/no-benefit stop、verdict recomputation。
- **验收标准**：记录 immutable verdict；仅 continue 允许向 owner 提出新的独立 research implementation phase。

> **已完成（2026-07-29）**：Owner 已明确授权绑定冻结哈希 `57fb4b9b033e61eb4e0b4b9a0f14ced28064b6fb17d73f5e7ae60552d0f37359` 的最多 10 次 recovery-only 外部实验。冻结 runner 在首个 `r0-ux-01-sync-state/direct-search` arm 收到第二个 `item.completed` agent-message 时，尝试把它再次登记为唯一 structured response；`TrustedReceiptLedger` 以 `RECEIPT_LEDGER_RESPONSE_DUPLICATE` fail closed。该事件直接满足事前 `event-ledger-integrity-failed` stop 条件，因此剩余 9 次调用未执行，未通过改 runner、忽略错误或更换阈值制造结果。由于 runner 在 sealed-write 前终止，没有完整 run/raw stream/ledger、correctness 或 cost metrics；这些缺失已作为限制写入 immutable evidence。17 项定向测试、133 项全仓 Vitest、build/typecheck/lint、10-phase/144-task/26-contract roadmap、workspace/license、clean frozen install、production demo、98 项 preflight 与 evidence/source hashes 全部通过。R0-T4 attempt 1 如实记录 `R0-RECOVERY=stop`，R0 phase 设为 `failed`；P0-T17D `stop`、P0 `failed`、P0-T7/P1 锁定与零产品解锁边界完全不变。

## R1-T1 — Independent runner-remediation charter

### Prompt

- **背景**：R0-T4 因 frozen runner 重复登记 structured response 而 terminal stop；R0/P0 均 failed/stop。
- **目标**：新增不覆盖两条 stop chain 的独立 R1，并机械证明零产品解锁。
- **本阶段做**：新增 R1-RUNNER-REMEDIATION-001、独立 decision、owner authorization、R1-T1–T4 原子链与 validator dual-non-supersession checks。
- **本阶段不做**：不改 R0/P0 evidence/verdict，不修 runner，不冻结新 plan，不执行外部调用。
- **实现约束**：R1 phase 与 R1-T1 均 `depends_on: []`，只按 immutable hash 读取 R0 evidence；`recovery_of_failed_phase: R0`、`does_not_supersede: R0-RECOVERY`、`also_does_not_supersede: [P0-VALUE]`。
- **测试要求**：failed R0/P0、empty deps、dual decision isolation、authorization、dependency leakage、contract reverse mapping。
- **验收标准**：章程与全仓门禁通过后 `done`，仅 R1-T2 eligible。

> **已完成（2026-07-29）**：已新增 `R1-RUNNER-REMEDIATION-001`、独立 R1/R1-RECOVERY chain 与 owner authorization record；R1 phase 和 R1-T1 均为空 dependency，只按 immutable evidence/hash 指向 failed R0。Validator 现在要求 recovered phase failed、immediate stop decision non-supersession，并验证 additional terminal decision exclusions；R1 同时固定 `does_not_supersede: R0-RECOVERY` 与 `also_does_not_supersede: [P0-VALUE]`，既有 phase/task 对 R1 的依赖仍 fail closed。20 项定向测试、136 项全仓 Vitest、build/typecheck/lint、11-phase/148-task/27-contract roadmap 全部通过；charter proof hash 为 `d74ec66439511739af86a8b8f19c3594316034ffd11ce35a01ba517dd42bb6a7`，product unlock count 为 0，未执行外部调用。下一项仅为 R1-T2。

## R1-T2 — Multi-message classification 与 failure evidence sealing

### Prompt

- **背景**：frozen R0 runner 把每个 agent-message 都登记成唯一 final response，并在 throw 前丢失 raw/ledger。
- **目标**：只在 stream close 后登记一次 schema-valid final response，并保证所有失败路径先封存可重放证据。
- **本阶段做**：有界候选收集、response schema validation、唯一 final selection、protocol-failure terminal evidence、raw/stdout/stderr incremental sealing 与 hashes。
- **本阶段不做**：不执行外部 Codex arm、不修改 R0 evidence、不冻结下一批。
- **实现约束**：普通 agent-message 只记 stdout receipt；零有效或冲突有效候选 fail closed；错误返回前必须写 terminal/error/hash evidence。
- **测试要求**：多 message 单 final、零/冲突 valid、duplicate prevention、terminal ordering、raw/ledger/error sealing、bounds/cancel。
- **验收标准**：定向及全仓门禁通过后 `done`，使 R1-T3 eligible。

> **已完成（2026-07-29）**：新增独立 `RemediatedRunRecorder`，把所有 agent-message 作为普通 receipt 留存，待进程和 streams 关闭后才校验候选并恰好选择一次 schema-valid 最终响应；零有效或互相冲突的有效响应 fail closed，内容相同的重复有效响应不会造成重复登记。所有成功和失败路径均先增量封存 bounded raw stdout/stderr、terminal observation、ledger、error metadata 与 SHA-256 manifest，再向调用方返回；真实本地子进程证明多消息单 final 成功及冲突 final 失败均可重放。7 项定向测试、143 项全仓 Vitest、build/typecheck/lint 与 11-phase/148-task/27-contract roadmap 全部通过；instrumentation hash 为 `c4f972ea540b12b877be0918397352cbdf0980974f086e1dffe81b290b29614a`，未执行外部调用。下一项仅为 R1-T3。

## R1-T3 — Remediated recovery preregistration

### Prompt

- **背景**：R1-T2 提供新 runner semantics 与 failure sealing。
- **目标**：冻结新 runner/capsule/ledger/task/threshold hashes，保持 recovery-only corpus 与 product holdout 分离。
- **本阶段做**：生成新 preregistration、counterbalance、equal base context、setup policy、failure evidence contract 与 external authorization gate。
- **本阶段不做**：不执行外部 arm、不复用 R0 hash、不授权产品工作。
- **实现约束**：新 instrumentation hash 必须不同于 R0；`externalExecutionAuthorized=false`；ground truth evaluator-only。
- **测试要求**：source bindings、fresh hash、task/capsule equality、holdout exclusion、mutation、authorization false、local probes。
- **验收标准**：冻结并通过 probes 后 `done`；R1-T4 等待单独 owner authorization。

> **已完成（2026-07-29）**：冻结了 5 个全新 R1 task ID/提示/fixture、10 个 counterbalanced arms、equal base context、仅 `vem-context.json` 的 treatment difference、既有 P0/R0 task/prompt 与产品 holdout 排除，以及 evaluator-only ground truth。新 R1-T4 runner、remediated recorder、capsule、v2 auditor 和 canonical runtime 均按 source hash 绑定；failure contract 要求 stream close 后唯一选择 final，任何协议失败在返回前封存 raw/terminal/ledger/error/SHA evidence，并在首个 integrity failure 后停止批次。20 个本地隔离 probes、8 项 R1-T3 定向测试、151 项全仓 Vitest、build/typecheck/lint、roadmap/workspace/license、clean frozen install、production demo、98 项 preflight 与最终 digest/source-binding 检查全部通过。预注册 hash 为 `8d93104c915fdb0acce9f31bdf7c34bbc4d19f0ac74e1b2609a10ddce35ca7f1`，instrumentation hash 为 `388b1e0d89deea9a91c2d8c3701131fa358d60f988a78fd9d9098cd4c07cd231`；`externalExecutionAuthorized=false`，未执行任何外部 arm。R1-T4 仅在 owner 单独绑定该完整 preregistration hash 后 eligible。

## R1-T4 — Separately authorized remediated recovery verdict

### Prompt

- **背景**：R1-T3 已冻结新的 runner/instrumentation plan。
- **目标**：在单独 owner authorization 后执行 paired arms 并记录 `R1-RECOVERY` verdict。
- **本阶段做**：fresh contexts、raw/ledger/error evidence、correctness、capsule integrity 与 cost verdict。
- **本阶段不做**：不覆盖 R0/P0、不自动解锁或创建产品 phase。
- **实现约束**：任何 prereg/source/capsule/holdout/failure-sealing drift fail closed。
- **验收标准**：immutable verdict；continue 也仅允许提出新的独立研究路线。

> **已完成（2026-07-29）**：Owner 授权、preregistration digest 和全部 source bindings 通过后开始冻结 batch。首个 direct arm 成功、定位与 capsule audit 均正确；配对 VEM arm 退出 0，但依次产生两个不同的 schema-valid 响应（错误的 `line:1/sourceAnchorId:null` 与正确的 `line:7/direct anchor`），修复后的 recorder 在 stream close 后按预登记规则判定 `STRUCTURED_RESPONSE_CONFLICT`，没有事后挑选结果。两个 run 的 raw stdout/stderr、terminal、ledger、run/failure metadata 和 SHA manifests 全部封存并验证通过，随后 batch fail closed，剩余 8 次未执行。19 项 R1 定向测试、155 项全仓 Vitest、build/typecheck/lint、roadmap/workspace/license、clean frozen install、production demo 和 98 项 preflight 全部通过。Immutable verdict 为 `R1-RECOVERY=stop`，R1 phase 为 `failed`；R0/P0 stop 与零产品解锁边界不变。证据位于 `docs/test-evidence/R1-T4/20260729T213524+0800/`，verdict hash 为 `a0a9556a63d68fcbe769da96f140e54d1d966421d0c3bad1cbffca1f24ab9baa`。

## R2-T1 — Independent final-output remediation charter

### Prompt

- **背景**：R1-T4 因 JSONL 中两个 schema-valid agent-message 触发 immutable stop；R1/R0/P0 均 failed/stop。
- **目标**：新增不覆盖三条 stop chain 的独立 R2，并机械证明零产品解锁。
- **本阶段做**：新增 R2-FINAL-OUTPUT-001、独立 decision、owner authorization、R2-T1–T4 原子链与 validator triple-non-supersession checks。
- **本阶段不做**：不改 R1/R0/P0 evidence/verdict，不修 runner，不冻结新 plan，不执行外部调用。
- **实现约束**：R2 phase 与 R2-T1 均 `depends_on: []`，只按 immutable evidence/hash 读取 failed R1；同时固定不 supersede R1/R0/P0 decision。
- **测试要求**：failed R1/R0/P0、empty deps、triple decision isolation、authorization、dependency leakage、contract reverse mapping。
- **验收标准**：章程与全仓门禁通过后 `done`，仅 R2-T2 eligible。

> **已完成（2026-07-29）**：已新增 `R2-FINAL-OUTPUT-001`、独立 R2/R2-RECOVERY chain 与 owner authorization record；R2 phase 和 R2-T1 均为空 dependency，只读取 failed R1 的 immutable terminal state。Validator 机械要求 `does_not_supersede: R1-RECOVERY` 与 `also_does_not_supersede: [R0-RECOVERY, P0-VALUE]`，并继续拒绝既有 phase/task 对 R2 的依赖。17 项定向测试、157 项全仓 Vitest、build/typecheck/lint 与 12-phase/152-task/28-contract roadmap 全部通过；charter proof hash 为 `46e7522676d366c5b93f2e32b6c682fabb76c5d3fa790a37a60eb6692171c25d`，product unlock count 为 0，未执行外部调用。下一项仅为 R2-T2。

## R2-T2 — Authoritative final-output file 与 single-file capsule bind

### Prompt

- **背景**：R1 runner 把 JSONL 中所有 schema-valid agent-message 当作 final candidates，但 JSONL 是事件审计流。
- **目标**：以 `--output-last-message` 文件作为唯一 final response，并保持 participant workspace 只读。
- **本阶段做**：新 R2 capsule/recorder、runner-owned 0600 single-file bind、final file size/schema/symlink checks、last agent-message consistency、协议/attribution 分类与 failure sealing。
- **本阶段不做**：不修改 frozen R1 source/evidence，不执行外部 Codex arm，不冻结下一批。
- **实现约束**：JSONL 只作 audit；早期 agent-message 不竞争 final；missing/invalid/mismatch fail closed；未选择响应时 wrong-attribution 必须为 false。
- **测试要求**：early wrong/later correct、authoritative file、missing/invalid/mismatch/oversize/symlink、single writable file、raw/final/ledger/error/hash sealing、cancel。
- **验收标准**：定向及全仓门禁通过后 `done`，使 R2-T3 eligible。

> **已完成（2026-07-29）**：已新增独立 R2 capsule/recorder，Codex invocation 同时保留 `--json` 审计流并用 `--output-last-message /run/vem/final-response.json` 提供唯一权威响应；runner 在进程与 streams 收束后执行 regular-file/no-symlink/size/schema 检查，并与最后 agent-message 做 canonical 一致性校验，早期错误的 schema-valid message 不再参与竞争。Bubblewrap 继续以 `/work:ro` 挂载 participant workspace，输出目录只读覆盖后仅叠加一个 runner-owned 0600 可写文件；workspace 和 sibling write probes 均拒绝。缺失、空、无效、不一致、超限、symlink、stream cancellation 均先封存 raw/final observation/terminal/ledger/error/SHA evidence；未选择响应时 `wrongAttribution=false`，`evidenceSealed` 与 `successfulResponseComplete` 分离。12 项定向测试、169 项全仓 Vitest、build/typecheck/lint 与 roadmap 全部通过；instrumentation hash 为 `235e7c8433787ef838c1f30d492e3ef24cb62ebd6ebf26bd43ca9cd559c0f8ab`，proof hash 为 `0dcae05aec4d39e37089039354a1c6fa1085387a364a7ae00effa7ac365ecbd8`，未执行外部模型调用。下一项仅为 R2-T3。

## R2-T3 — Final-output recovery preregistration

### Prompt

- **背景**：R2-T2 提供明确 final-output authority 与最小 capsule 写入边界。
- **目标**：冻结新 runner/capsule/task/threshold hashes，保持 recovery-only corpus 与 product holdout 分离。
- **本阶段做**：生成新 preregistration、counterbalance、equal base context、final-file contract、failure evidence contract 与 external authorization gate。
- **本阶段不做**：不执行外部 arm、不复用 R1 hash、不授权产品工作。
- **实现约束**：新 instrumentation hash 必须不同于 R1；`externalExecutionAuthorized=false`；ground truth evaluator-only。
- **测试要求**：source bindings、fresh hash、task/capsule equality、holdout exclusion、final-file mutation、authorization false、local probes。
- **验收标准**：冻结并通过 probes 后 `done`；R2-T4 等待单独 owner authorization。

> **已完成（2026-07-29）**：已冻结 5 个全新 R2 final-output-remediation-only task、10 个 counterbalanced arms、equal base context 与仅 `vem-context.json` 的 treatment difference；P0/R0/R1 task ID、prompt hash 和 P1/P3/P4 product holdout 均排除。未来 R2-T4 runner、权威 final-file recorder、single-file capsule、v2 auditor、evaluator 与 canonical runtime 绑定 8 个 source hashes；协议失败独立归类为 `protocol-response-integrity-failed`，没有 selected response 时不制造 wrong attribution。10 次 filesystem、10 次 capsule 内 `codex --version` 和 10 次 final-output single-file probes 全部通过；4 项 R2-T3 定向测试、173 项全仓 Vitest、build/typecheck/lint、roadmap/workspace/license、clean frozen install、production demo 与 98 项 preflight 回归通过。预注册 hash 为 `dddd48ade2a92b2e12ec7600c9cdc0bd65eee6d47023d01d70b8bd71b47c273a`，instrumentation hash 为 `09e237ddec722207ee3b2e22c714ca5631700ff7393877a66fdd75d04c46b8a0`；`externalExecutionAuthorized=false`，未执行任何外部 arm。R2-T4 仅在 owner 单独绑定该完整 hash 和 10 次 run 后 eligible。

## R2-T4 — Separately authorized final-output recovery verdict

### Prompt

- **背景**：R2-T3 已冻结新的 runner/instrumentation plan。
- **目标**：在单独 owner authorization 后执行 paired arms 并记录 `R2-RECOVERY` verdict。
- **本阶段做**：fresh contexts、final-file/JSONL consistency、raw/ledger/error evidence、correctness、capsule integrity 与 cost verdict。
- **本阶段不做**：不覆盖 R1/R0/P0、不自动解锁或创建产品 phase。
- **实现约束**：任何 prereg/source/capsule/holdout/final-file/failure-sealing drift fail closed。
- **验收标准**：immutable verdict；continue 也仅允许提出新的独立研究路线。

> **已完成（2026-07-29）**：Owner 授权、完整 preregistration digest、8 个 frozen source bindings 和 15 项 capsule/recorder/preregistration 门禁通过后启动批次。前 8 个 run 全部通过；第 9 个 direct arm 同样退出 0，权威 final file 与最后 JSONL agent message 一致且定位正确，但其命令事件包含 frozen v2 auditor 禁止的 `AGENTS.md` marker，触发 `CAPSULE_AUDIT_V2_ESCAPE`。异常在 frozen runner 中未捕获，因而审计失败证据没有在返回前封存；批次 fail closed，剩余第 10 次未执行。无外部重试的 post-abort sealer 只读取并哈希封存现有证据，不修改任何 frozen binding。最终 9/9 定位正确、9 个 fresh unique threads、0 protocol failure、0 wrong attribution；immutable verdict 为 `R2-RECOVERY=stop`，stop reasons 为 `capsule-integrity-failed` 与 `failure-evidence-not-sealed-before-return`，9/10 incomplete batch 同时记为 adjust reason 但不覆盖 stop。44 项定向测试、180 项全仓 Vitest、build/typecheck/lint、roadmap/workspace/license、clean frozen install、production demo 与 98 项 preflight 全部通过。R2 phase 为 `failed`，R1/R0/P0 stops 与零产品解锁边界不变。证据位于 `docs/test-evidence/R2-T4/20260729T230343+0800/`，verdict hash 为 `ada1fb7e4c4ae202060a5e98e00dafedecfd4862803c61bab1970d7e30d681e1`。

## R3-T1 — Independent capsule-audit containment charter

### Prompt

- **背景**：R2-T4 因 marker-only `AGENTS.md` lookup 被 frozen auditor 判为 escape，且 audit exception 在顶层 evidence seal 前逃逸；R2/R1/R0/P0 均 failed/stop。
- **目标**：新增不覆盖四条 stop chain 的独立 R3，并机械证明零产品解锁。
- **本阶段做**：新增 R3-CAPSULE-AUDIT-CONTAINMENT-001、独立 decision、owner authorization、R3-T1–T4 原子链与 validator/proof four-terminal checks。
- **本阶段不做**：不改 R2/R1/R0/P0 evidence/verdict，不修 auditor/runner，不冻结新 plan，不执行外部调用。
- **实现约束**：R3 phase 与 R3-T1 均 `depends_on: []`，只按 immutable evidence/hash 读取 failed R2；同时固定不 supersede R2/R1/R0/P0 decisions。
- **测试要求**：failed R2/R1/R0/P0、empty deps、four-decision isolation、authorization、dependency leakage、contract reverse mapping。
- **验收标准**：章程与全仓门禁通过后 `done`，仅 R3-T2 eligible。

> **已完成（2026-07-29）**：已新增 `R3-CAPSULE-AUDIT-CONTAINMENT-001`、独立 R3/R3-RECOVERY chain、owner authorization record 与四任务原子序列；R3 phase 和 R3-T1 均为空 dependency，只读取 failed R2 的 immutable terminal evidence。机械证明固定 `does_not_supersede: R2-RECOVERY` 与 `also_does_not_supersede: [R1-RECOVERY, R0-RECOVERY, P0-VALUE]`，并拒绝任何既有 phase/task 对 R3 的依赖；generic validator 也要求每一层 recovery 精确保留完整 ancestor stop chain。27 项治理/章程定向测试、184 项全仓 Vitest、build/typecheck/lint 和 13-phase/156-task/29-contract roadmap 全部通过；product unlock count 为 0，未执行外部调用。下一项仅为 R3-T2。

## R3-T2 — Mention-versus-observed-access audit 与 exception containment

### Prompt

- **背景**：R2 frozen v2 auditor 把命令文本中的 marker mention 直接等同于 capsule escape，且 audit throw 未进入终态封存。
- **目标**：保持真实 escape fail closed，同时避免 marker-only/no-output lookup 误判，并确保 audit/evaluator/hash/aggregate exception 全部先封存再返回。
- **本阶段做**：新 versioned auditor、结构化 warning/violation evidence、新 R3 recorder/runner containment boundary、R2 run-nine read-only replay 与 local failure probes。
- **本阶段不做**：不修改 frozen R2 source/evidence，不执行外部 Codex arm，不冻结下一批。
- **实现约束**：命令 mention 本身不是访问证据；观察到 forbidden path/content 或 unsafe absolute path 仍 stop；每个异常路径必须有 raw/final/terminal/ledger/error/SHA。
- **测试要求**：marker mention/no output、safe `/work` search、forbidden output/content、external path、stderr/symlink、audit/evaluator/hash/aggregate throw、cancel、bounds、R2 replay。
- **验收标准**：定向及全仓门禁通过后 `done`，使 R3-T3 eligible。

> **已完成（2026-07-30）**：新增 v3 auditor，以 `item.id` 关联 started/completed、只把 completed observation 作为访问证据；真实 R2 第 9 次 run 只产生 1 个 non-authorizing bounded-discovery warning，而规则/skill path 或内容、auth、`/proc`、遍历、stderr 和 capsule 外路径仍 fail closed。新增 R3 permission-profile capsule：生成命令默认拒绝 filesystem root，仅开放最小 runtime、只读 `/opt/codex`/`/work`，显式拒绝 auth、禁用网络与交互扩权，并从空继承重建固定非敏感环境；无模型假凭据实测证明 auth 不可读、workspace 不可写且 `/proc/self/environ` 无敏感变量。新的 finalizer 分层保留 recorder `SHA256SUMS`，为 audit/evaluator/hash/aggregate exception 在返回前封存 raw/final/terminal/ledger/error 与外层 manifest。冻结前复核又补齐了 `SKILL.md` 及 AGENTS/SKILL 合并负查找的同型 warning 语义、observed skill path fail-closed、dummy-secret stderr 检查、network policy 配置证据与 runtime probe 的诚实区分，以及 wrong-attribution run/batch stop；旧证据保持不变，新 sibling 证据位于 `docs/test-evidence/R3-T2/20260730T004219+0800/`，superseding proof hash 为 `fadca8e3f7660f144bd31ae8ab5e1155d9eb1f6ad3cc07634f2ea830306a8ec3`。修补后的 33 项定向测试、排除尚未 eligible 的 R3-T3 runner 草稿后 227 项全仓 Vitest、build/typecheck/affected lint 与 13-phase/156-task/29-contract roadmap 均通过；两份 proof 的外部模型调用均为 0，R2/R1/R0/P0 stop 不变。下一项仅为 R3-T3。

## R3-T3 — Capsule-audit containment recovery preregistration

### Prompt

- **背景**：R3-T2 提供 versioned audit semantics 与 in-run exception sealing。
- **目标**：冻结新 runner/auditor/capsule/task/threshold hashes，保持 recovery-only corpus 与 product holdout 分离。
- **本阶段做**：生成新 preregistration、counterbalance、equal base context、audit warning/violation contract、failure evidence contract 与 external authorization gate。
- **本阶段不做**：不执行外部 arm、不复用 R2 hash、不授权产品工作。
- **实现约束**：新 instrumentation hash 必须不同于 R2；`externalExecutionAuthorized=false`；ground truth evaluator-only。
- **测试要求**：source bindings、fresh hash、task/capsule equality、holdout exclusion、auditor/runner mutation、authorization false、local probes。
- **验收标准**：冻结并通过 probes 后 `done`；R3-T4 等待单独 owner authorization。

> **已完成（2026-07-30）**：冻结 5 个全新 recovery-only task、10 个 AB/BA counterbalanced arm、equal-base capsule 和 10 项完整 runtime source binding；instrumentation hash 为 `1592699eea206c5d75327053c065a44a27153ff2d3e263692751e56917d6ca80`，完整 preregistration hash 为 `8b886d443c576540f6b3b2d90e06abfd95d57955f696680dd998b748d4ffdd5b`。runner 冻结了 direct-null/VEM-anchor ground truth、authoritative final-file、v3 audit、当前无模型 permission preflight、异常/哈希/aggregate 封存及按 pair saving 中位数计算的 verdict；四份 terminal stop verdict 与五份既有 preregistration 均按已知哈希重验。30 次本地 filesystem/Codex-binary/permission-profile probe、82 项定向测试、239 项全仓 Vitest、build/typecheck/lint、13-phase/156-task/29-contract roadmap、预注册复验和敏感信息/symlink 检查全部通过。证据位于 `docs/test-evidence/R3-T3/20260730T114932+0800/`；`externalExecutionAuthorized=false`、product unlock count 为 0，未执行外部模型调用。R3-T4 仍需绑定上述完整 hash 和恰好 10 次实验的单独 owner authorization。

## R3-T4 — Separately authorized capsule-audit containment verdict

### Prompt

- **背景**：R3-T3 已冻结新的 auditor/runner/instrumentation plan。
- **目标**：在单独 owner authorization 后执行 paired arms 并记录 `R3-RECOVERY` verdict。
- **本阶段做**：fresh contexts、final-file/JSONL/audit consistency、raw/ledger/error evidence、correctness、capsule integrity 与 cost verdict。
- **本阶段不做**：不覆盖 R2/R1/R0/P0、不自动解锁或创建产品 phase。
- **实现约束**：任何 prereg/source/capsule/holdout/audit/failure-sealing drift fail closed。
- **验收标准**：immutable verdict；continue 也仅允许提出新的独立研究路线。

> **已完成（2026-07-30）**：Owner 先绑定完整 preregistration hash 和 10 次上限，再明确授权向 OpenAI Codex `gpt-5.6-sol` 发送冻结 participant capsule 数据。冻结 hash、10 项 source binding、当前 permission preflight 与 27 项 runner/封存测试通过后启动批次；首个 direct arm 获得 fresh thread ID，但外部请求连续重连后 `request timed out`，未产生 `turn.completed` 或权威 final response，进程退出 1。v3 capsule audit、permission/auth boundary、ground-truth evaluator、recorder/outer hash 与失败证据封存均通过；预登记的 `protocol-response-integrity-failed` 要求立即 stop，剩余 9 次未执行。immutable verdict 为 `R3-RECOVERY=stop`，incomplete batch 同时记录 adjust reason 但不覆盖 stop；R3 phase 为 `failed`，R2/R1/R0/P0 stops 与零产品解锁边界不变。证据位于 `docs/test-evidence/R3-T4/20260730T133111-0800/`，canonical verdict hash 为 `7a3e5b6bf94067e4681258982690afe911c51dc3da0e6cc4af66d069d537d95b`。

## R4-T1 — Independent external-transport timeout remediation charter

### Prompt

- **背景**：R3-T4 首个 fresh process 因外部 request timeout 产生空 authoritative response 并触发 terminal stop；R3/R2/R1/R0/P0 均 failed/stop。
- **目标**：新增不覆盖五条 stop chain 的独立 R4，并机械证明零产品解锁。
- **本阶段做**：新增 R4-TRANSPORT-TIMEOUT-001、独立 decision、owner authorization、R4-T1–T4 原子链与 five-terminal validator/proof checks。
- **本阶段不做**：不改 R3/R2/R1/R0/P0 evidence/verdict，不修 runner，不冻结新 plan，不执行外部调用。
- **实现约束**：R4 phase 与 R4-T1 均 `depends_on: []`，只按 immutable evidence/hash 读取 failed R3；固定不 supersede R3/R2/R1/R0/P0 decisions。
- **测试要求**：failed R3/R2/R1/R0/P0、empty deps、five-decision isolation、authorization、dependency leakage、contract reverse mapping。
- **验收标准**：章程与全仓门禁通过后 `done`，仅 R4-T2 eligible。

> **已完成（2026-07-30）**：新增 `R4-TRANSPORT-TIMEOUT-001`、独立 R4/R4-RECOVERY chain、owner authorization 与 R4-T1–T4 四任务原子序列。R4 phase 和 R4-T1 均为空 dependency，只读取 failed R3 的 immutable terminal evidence；decision 固定 `does_not_supersede: R3-RECOVERY` 与完整 R2/R1/R0/P0 ancestor chain，且任何既有 phase/task 不得依赖 R4。32 项治理/章程定向测试与 14-phase/160-task/30-contract roadmap 门禁通过，product unlock count 为 0，外部调用为 0。下一项仅为 R4-T2。

## R4-T2 — Zero-model preflight, timeout classification and bounded retry

### Prompt

- **背景**：R3-T4 把 provider request timeout 正确记为 protocol failure，但没有独立 transport classification 或受全批预算约束的 outer retry。
- **目标**：在不调用外部模型的前提下实现诚实 preflight、窄 timeout-before-response 分类、有限 retry controller 和逐 attempt 封存。
- **本阶段做**：本地 capability preflight、R3 timeout replay、synthetic partial/auth/rate-limit/unknown cases、retry budget/state machine、attempt evidence。
- **本阶段不做**：不联系 provider、不执行外部 Codex arm、不修改 R3 evidence、不冻结下一批。
- **实现约束**：只有 sealed nonzero/no-final/no-turn-completed/timeout-turn-failed 可重试；每 arm 最多一次、全批最多 20 process attempts；每次 attempt 独立且不可覆盖。
- **测试要求**：network-unprobed honesty、timeout shape、partial response、auth/rate-limit/unknown、second timeout、budget、fresh IDs、evidence immutability、R3 replay。
- **验收标准**：定向及全仓门禁通过后 `done`，仅 R4-T3 eligible。

> **已完成（2026-07-30）**：新增零模型 local transport preflight，真实 capsule 内验证当前 `codex-cli 0.144.5`、只读 workspace、generated-command auth denial 与固定非敏感环境，同时明确 `networkRuntimeProbed=false`、不声称 provider reachability。窄分类器只接受 sealed nonzero/no-final/no-agent/no-turn-completed/timeout-turn-failed；partial/completed response、auth、rate limit、unknown、audit/permission/evidence failure 均不可重试。retry controller 固定每 arm 最多 1 次、全批最多 20 process attempts、fresh run ID 和 immutable attempt evidence hash。R3 timeout evidence 的只读 replay 被分类为 `external-transport-timeout-before-response` 并只生成 retry plan，未执行 retry。16 项定向测试与 proof SHA 通过；证据位于 `docs/test-evidence/R4-T2/20260730T142100+0800/`，proof hash 为 `2d19fd9b848018f08d3dcbd937c17f6764036974666d626bb8827ddfcbe9a42f`，外部调用为 0。下一项仅为 R4-T3。

## R4-T3 — Transport-timeout recovery preregistration

### Prompt

- **背景**：R4-T2 提供零模型 preflight、timeout classifier 与 bounded retry controller。
- **目标**：冻结新 runner/task/threshold/source hashes、每 arm retry 上限与全批 process-attempt budget。
- **本阶段做**：新 recovery-only task bank、counterbalance、equal-base capsules、attempt policy、transport/failure contracts、external authorization gate。
- **本阶段不做**：不执行外部 arm、不复用 R3 instrumentation hash、不授权产品工作。
- **实现约束**：`maxRetriesPerArm=1`、`maxProcessAttempts=20`、`externalExecutionAuthorized=false`；ground truth evaluator-only，所有五条 stop immutable。
- **测试要求**：fresh tasks/source bindings、capsule equality、retry budget、holdout exclusion、preflight/runner mutation、authorization false、local probes。
- **验收标准**：冻结并通过 probes 后 `done`；R4-T4 等待单独 owner authorization。

> **已完成（2026-07-30）**：冻结 5 个全新 transport-remediation-only task、10 个 AB/BA paired arms、equal-base capsule、每 arm 最多 1 次 retry 与全批最多 20 个 process attempts。未来 runner 绑定 exact destination/model/data-scope authorization、零模型 current preflight、窄 timeout-before-response classifier、per-attempt immutable evidence、retry-aware total-arm cost 与 terminal verdict；10 项 runtime source binding 的 instrumentation hash 为 `78ec7bd51ffd3cbf7f36cddabdd16dcd73d5d88877700632350471d81865f064`，data-scope hash 为 `2fe4246a5cdd3aee19efb1d2e2f56f2469ba82c8f5dc32f1651c68a86d0b8ca8`。30 个本地 filesystem/Codex-binary/permission-profile probe、28 项 R4 plan/prereg/runner 定向测试、48 文件/272 项全仓 Vitest、build/typecheck/lint、14-phase/160-task/30-contract roadmap、完整 digest/source/probe 复验与 symlink 检查通过。预注册位于 `docs/test-evidence/R4-T3/20260730T143215-0800/`，完整 hash 为 `0ddb8c6f51d140042167231a22f8b3f73735fc8d0e271e3da5f11590c9995104`；`externalExecutionAuthorized=false`、product unlock count 为 0，外部调用为 0。R4-T4 仍需绑定完整 hash、OpenAI Codex/gpt-5.6-sol、data-scope hash、10 个成功 arms 和最多 20 个 external process attempts 的单独知情授权。

## R4-T4 — Separately authorized bounded-attempt transport verdict

### Prompt

- **背景**：R4-T3 已冻结新的 transport-aware runner/instrumentation plan。
- **目标**：在单独 owner authorization 后执行 paired arms 和受限 attempts，并记录 `R4-RECOVERY` verdict。
- **本阶段做**：fresh contexts、retry classification、final-file/JSONL/audit consistency、attempt/batch evidence、correctness 与 cost verdict。
- **本阶段不做**：不覆盖 R3/R2/R1/R0/P0，不自动解锁或创建产品 phase。
- **实现约束**：任何 prereg/source/capsule/holdout/attempt-budget/failure-sealing drift fail closed；授权必须绑定目的地、数据范围和最多 20 process attempts。
- **验收标准**：immutable verdict；continue 也仅允许提出新的独立研究路线。

> **执行受阻（2026-07-30）**：Owner authorization 已精确绑定 OpenAI Codex/gpt-5.6-sol、完整 preregistration/data-scope hashes、10 个成功 arms 与最多 20 个 external processes。冻结 preflight 与授权复验通过后只启动首个 direct arm；Codex 子进程依次耗尽 WebSocket 5 次 timeout reconnect、fallback 至 HTTPS 后再耗尽 5 次 timeout reconnect，却没有退出或产生 `turn.failed`、`turn.completed`、权威 final response。冻结 runner 缺少独立 wall-clock/process-tree termination，因而无法封存 attempt 并进入受限 retry controller。为执行有限授权边界，批次被终止；第二个进程及 retry 均未启动，partial evidence 原样保留于 `docs/test-evidence/R4-T4/20260730T144143-0800/`，incident hash 为 `95021eac99d93d49985ee46d003a4108ff7a524244d83e3521b8edff8ecffd70`。本 prompt **未完成**，`R4-T4=blocked`、`R4-RECOVERY=pending`，没有生成或推断 `continue/adjust/stop` verdict。

## R5-T1 — Independent process-tree termination remediation charter

### Prompt

- **背景**：R4-T4 首个 authorized process 在 transport reconnect 耗尽后仍不退出；R4-T4/R4 保持 blocked，R4-RECOVERY 保持 pending，R3/R2/R1/R0/P0 保持 failed/stop。
- **目标**：新增不覆盖 blocked R4 或五条 stop chain 的独立 R5，并机械证明零产品解锁。
- **本阶段做**：新增 R5-PROCESS-TERMINATION-001、独立 decision、owner authorization、R5-T1–T4 原子链、blocked-phase validator 与 six-decision proof checks。
- **本阶段不做**：不改 R4/R3/R2/R1/R0/P0 evidence/status/verdict，不修 runner，不冻结新 plan，不执行外部调用。
- **实现约束**：R5 phase 与 R5-T1 均 `depends_on: []`，只按 immutable evidence/hash 读取 blocked R4；固定不 supersede R4 pending decision 与 R3/R2/R1/R0/P0 terminal decisions。
- **测试要求**：blocked R4/pending attempt、五条 failed/stop、empty deps、six-decision isolation、authorization、dependency leakage、contract reverse mapping。
- **验收标准**：章程与全仓门禁通过后 `done`，仅 R5-T2 eligible。

> **已完成（2026-07-30）**：已新增 `R5-PROCESS-TERMINATION-001`、独立 R5/R5-RECOVERY chain、owner authorization record 与 R5-T1–T4 原子序列；validator 现在能独立验证 blocked/pending remediation，并机械保持 R4-T4/R4=`blocked`、R4-RECOVERY=`pending` 与 R3/R2/R1/R0/P0 五条 failed/stop chain。R5 无 phase/task dependency，也没有既有任务依赖 R5；15-phase/164-task/31-contract roadmap、30 项定向测试及 49 文件/282 项全仓测试通过，product unlock count 与外部调用均为 0。下一项仅为 R5-T2。

## R5-T2 — Wall-clock/process-tree termination 与 interruption-safe sealing

### Prompt

- **背景**：R5-T1 只建立 blocked-phase 独立 remediation authority；R4 frozen runner 没有 independent deadline 或 process-tree termination。
- **目标**：在零外部模型调用下实现 trusted outer-runner wall-clock deadline、process-tree kill、stream drain 与统一 terminal evidence sealing。
- **本阶段做**：monotonic spawn deadline、graceful-to-force signal escalation、process-group/tree observation、stdout/stderr/final-file drain、timeout/cancel/signal/exception terminalizer、synthetic/local child probes。
- **本阶段不做**：不联系 provider、不修改或恢复 R4 attempt、不冻结 R5-T3 plan、不执行 participant arm。
- **实现约束**：deadline 从 spawn 计时；无法证明整棵进程树终止、出现 orphan/terminal contradiction 或 sealing 不完整时 fail closed；runner termination 不伪造成 provider `turn.failed`。
- **测试要求**：normal exit、deadline、grace/force、child/grandchild、orphan refusal、stream drain、missing final、cancel/signal/exception、evidence-before-return、bounds、no-provider-terminal-invention。
- **验收标准**：定向及全仓门禁通过后 `done`，仅 R5-T3 eligible。

> **已完成（2026-07-30）**：已新增 R5 版本化 outer-runner terminalization boundary，以 `process.hrtime.bigint` 从 spawn 起执行 wall-clock deadline，并用独立 process group 对 parent/descendant 进行有界 `SIGTERM`→`SIGKILL` 终止；normal、deadline、force、cancel/signal、launch/audit/evaluator exception、missing final、orphan 与 terminal contradiction 均在返回前封存 bounded stdout/stderr、final observation、receipt ledger、permission/audit/evaluator state、termination metadata、failure classification 和 SHA manifest。10 项终止器测试、1 项本地综合 proof 及 51 文件/293 项全仓测试通过；证据位于 `docs/test-evidence/R5-T2/20260730T153607+0800/`，proof hash 为 `f42297572767611c7707b3d5f0f363ba54f409c4c8ae832652bb808214621799`。所有 probe 均为本地合成进程，外部模型调用为 0；runner termination 从未伪造 provider `turn.failed`，R4 blocked/pending 与五条 stop chain 未改变。下一项仅为 R5-T3。

## R5-T3 — Process-termination recovery preregistration

### Prompt

- **背景**：R5-T2 提供受测的 deadline/process-tree terminalizer 与 interruption-safe sealer。
- **目标**：冻结新 runner/task/threshold/source hashes、deadline/grace/signal policy 与全批 process-attempt budget。
- **本阶段做**：fresh recovery-only task bank、counterbalance、equal-base capsules、termination/failure contracts、budget、external authorization gate。
- **本阶段不做**：不执行外部 arm、不复用 R4 instrumentation hash、不授权产品工作。
- **实现约束**：`externalExecutionAuthorized=false`；deadline/grace/signal/budget 全部纳入 hash；ground truth evaluator-only，R4 blocked/pending 与五条 stop immutable。
- **测试要求**：fresh tasks/source bindings、capsule equality、deadline/grace/signal/budget、holdout exclusion、termination mutation、authorization false、local probes。
- **验收标准**：冻结并通过 probes 后 `done`；R5-T4 等待单独 owner authorization。

> **已完成（2026-07-30）**：已冻结 5 个全新 process-termination-only tasks、10 个 counterbalanced arms、equal-base read-only capsules、10 项 runtime source bindings，以及 process-aware R5-T4 runner/classifier。Termination policy 固定为 spawn 后 `120000ms` deadline、`5000ms` graceful window、`5000ms` force-observation window、`SIGTERM`→`SIGKILL`、每 arm 最多 1 次且仅限已观察 provider timeout 的 retry、全批最多 20 个 external processes；runner deadline termination 明确不可重试且不能冒充 provider `turn.failed`。30 个本地 filesystem/binary/permission probes、20 项 R5 联合定向测试及 53 文件/303 项全仓测试通过。预注册位于 `docs/test-evidence/R5-T3/20260730T154956-0800/`：preregistration hash `8a7b315cfa5597b046228d9597a5805ad3b3dbd0becaa83a37f9ea81475ec886`，instrumentation hash `02fa73cd42572e703c33516b5a5f10a123f0f8e34dd0b82275016f8a8f9c6641`，data-scope hash `fefd57ecda3606e69eadb1165618cff24f76ce4ac699243a52f61171c98edba6`，termination-policy hash `ca4ffce3cf06abea99712e581a9732d6579a5490ff9f2bc24e3265b39991404f`。`externalExecutionAuthorized=false`、外部调用为 0；R4 blocked/pending 与五条 stop chain 不变。R5-T4 必须等待绑定上述完整边界的单独 owner authorization。

## R5-T4 — Separately authorized bounded-deadline verdict

### Prompt

- **背景**：R5-T3 已冻结新的 process-termination-aware runner/instrumentation plan。
- **目标**：在单独 owner authorization 后执行 paired arms 和受限 attempts，并记录 `R5-RECOVERY` verdict。
- **本阶段做**：fresh contexts、deadline/termination/retry classification、final-file/JSONL/audit consistency、attempt/batch evidence、correctness 与 cost verdict。
- **本阶段不做**：不覆盖 R4/R3/R2/R1/R0/P0，不自动解锁或创建产品 phase。
- **实现约束**：任何 prereg/source/capsule/holdout/deadline/budget/failure-sealing drift fail closed；授权必须绑定目的地、数据范围、deadline/grace/signal policy 和 process 上限。
- **验收标准**：immutable verdict；continue 也仅允许提出新的独立研究路线。

> **已完成（2026-07-30，`R5-RECOVERY=stop`）**：Owner authorization 已精确绑定 OpenAI Codex/gpt-5.6-sol、preregistration `8a7b315c…ec886`、data scope `fefd57ec…edba6`、10 个成功 arms、最多 20 个 processes，以及 120000ms deadline、两个 5000ms termination windows 与 `SIGTERM`→`SIGKILL` policy。Frozen source/probes/authorization 复验及本地 preflight 通过；证据目录的安全 ID 规范化保持 preregistration/authorization hashes 不变。首个 planned arm 在 `spawn` 前进入 frozen terminalizer options validation，但 R3 capsule invocation 没有 frozen terminalizer 强制要求的显式 `env` record，触发 `R5_EXECUTION_OPTIONS_INVALID`。因此 participant process、process group、model request、retry 与下一 arm 均未启动，external process/model-call count 为 0。该 runner-contract incompatibility 属于 `aggregate-integrity-failed` stop condition；失败、零调用、local preflight、run index、verdict 与 `RESULTS.sha256` 已封存于 `docs/test-evidence/R5-T4/20260730T155920-0800/`，canonical verdict hash 为 `c04a6631b6285735fa3ff1da0d576e31b1a85b3fbc981a69c25aa4cb27b0a016`。最终 54 个测试文件/308 项测试、build、typecheck、lint 与 roadmap validation 全部通过。R5 phase=`failed`；R4 blocked/pending 与 R3/R2/R1/R0/P0 stop chains 不变，零产品解锁。

## R6-T1 — Pre-spawn invocation remediation charter

### Prompt

- **背景**：R5-T4 在首个 arm 的 `spawn` 前因 capsule invocation 缺少 terminalizer 要求的显式 `env` record 而终止，R5 已形成 immutable stop。
- **目标**：只建立独立 R6 charter，固定 R5 stop、R4 blocked/pending、此前五条 stop 与零产品解锁边界。
- **本阶段做**：增加 R6 contract/phase/decision、owner authorization reference、recovery-after-blocked-remediation validator 语义和机械 charter proof。
- **本阶段不做**：不修改 capsule/terminalizer runtime，不生成预注册，不执行外部调用。
- **实现约束**：R6 phase/task dependency 为空；`R6-RECOVERY` 不 supersede R5、R4 或此前 decision；既有 phase/task 不依赖 R6。
- **测试要求**：failed R5、blocked/pending R4、五条 stop、七 decision chain、authorization、validator、dependency leak 和 product unlock 负例。
- **验收标准**：charter proof 与全仓目标测试通过后 `done`；下一项仅为 R6-T2。

> **已完成（2026-07-30）**：已登记独立 `R6-PRESPAWN-INVOCATION-001` contract、R6 phase 与 `R6-RECOVERY` decision chain，并扩展 validator，使其能在保持 R5 failed/stop 的同时机械保留祖先 R4 blocked/pending，而不会把 R4 伪造为 terminal stop。R6 phase/task dependency 为空，既有 phase/task 对 R6 的依赖数为 0，产品解锁数为 0。Charter proof 封存于 `docs/test-evidence/R6-T1/20260730T164000-0800/`，proof hash 为 `70d3a440099d3bb7ef8c676e07cb7e38351301548d8ee881c4959e4d58e9531f`；27 项跨代 charter 测试、26 项 validator/R6 定向测试以及沙箱外 55 文件/314 项全仓测试通过，build/typecheck/lint/roadmap validation 通过，外部调用为 0。下一项仅为 R6-T2。

## R6-T2 — Explicit outer env and zero-model compatibility preflight

### Prompt

- **背景**：R6-T1 已固定独立修复边界。
- **目标**：消除 capsule builder 与 bounded terminalizer 的 pre-spawn invocation 契约不兼容。
- **本阶段做**：给 exact capsule invocation 增加固定、不可变、只含字符串的 outer env；共享 terminalizer invocation predicate；执行 exact-builder zero-model compatibility/security preflight。
- **本阶段不做**：不运行 `codex exec` participant，不探测 provider network，不冻结或执行外部 batch。
- **实现约束**：outer env 只允许 `PATH=/usr/bin:/bin`，不得继承 host secret/user path；inner capsule env 和 R3 permission profile 继续独立 fail closed。
- **测试要求**：fixed PATH only、immutability、secret exclusion、builder/predicate parity、permission/auth/workspace probe、network-unprobed、zero model call。
- **验收标准**：目标测试和本地 proof 通过后 `done`；下一项仅为 R6-T3。

> **已完成（2026-07-30）**：`buildR3CodexCapsuleInvocation` 与其 zero-model permission probe 现在都显式携带同一个 immutable outer env `{PATH: "/usr/bin:/bin"}`，并把精确值/策略绑定进 invocation evidence；不再隐式继承 host env。R5 terminalizer 导出并在真实 options validation 中复用同一 `isR5ProcessInvocation` predicate，exact R3 decision invocation 已通过该 predicate。真实本地 Bubblewrap permission-profile proof 继续证明 generated command 不可读 auth、`/work` 不可写、敏感环境缺失且 `networkRuntimeProbed=false`；decision invocation 只构造未执行，participant process/provider request/model call 均为 0。证据位于 `docs/test-evidence/R6-T2/20260730T164800-0800/`，proof hash `2fe69ddf81f1a6a6a15b84ae144cdbf20dd67706cd4722ae3f91358b0086b8fa`，outer-env hash `cf24c3c5e349e230a9c04223dceb4854bd377915e21f46d830134b085bc3579d`。19 项 R6/capsule/terminalizer 定向测试与沙箱外 57 文件/319 项全仓测试通过，build/typecheck/lint/roadmap validation 通过；历史 R5 test 现明确证明旧 source binding 已 drift 并拒绝复用旧授权。下一项仅为 R6-T3。

## R6-T3 — Invocation-compatible recovery preregistration

### Prompt

- **背景**：R6-T2 已修复并证明 exact invocation 的 pre-spawn 兼容性。
- **目标**：冻结新的 runner/task/source/environment/termination/budget/evidence plan。
- **本阶段做**：fresh recovery-only task bank、counterbalance、equal-base capsules、explicit env hash、compatibility preflight hash、deadline/grace/signal/retry/process budget 与 authorization gate。
- **本阶段不做**：不执行外部 arm，不复用 R5 preregistration/instrumentation/authorization，不授权产品工作。
- **实现约束**：`externalExecutionAuthorized=false`；env/source/deadline/budget 全部纳入 hash；R5 stop、R4 blocked/pending 与五条 stop immutable。
- **测试要求**：fresh tasks/source binding、capsule equality、environment contract、preflight binding、termination policy、budget、holdout exclusion、immutability、authorization false。
- **验收标准**：冻结并通过 local probes 后 `done`；R6-T4 等待新的精确 owner authorization。

> **已完成（2026-07-30）**：已冻结 5 个全新 invocation-contract-only tasks、10 个 counterbalanced arms、equal-base read-only capsules、11 项 runtime source bindings，以及 invocation-compatible R6-T4 runner/verifier。新 plan 精确绑定 R6-T2 compatibility proof、immutable `{PATH: "/usr/bin:/bin"}` outer env、spawn 后 `120000ms` deadline、`5000ms` grace、`5000ms` force observation、`SIGTERM`→`SIGKILL`、每 arm 最多 1 次且仅限 sealed observed provider timeout 的 retry、全批最多 20 个 processes；runner deadline termination 继续不可重试。30 个本地 filesystem/Codex-binary/permission-profile probes 均通过且没有运行 participant，24 项 R6/terminalizer 定向测试及沙箱外 59 文件/330 项全仓测试通过。预注册位于 `docs/test-evidence/R6-T3/20260730T165800-0800/`：preregistration hash `935c7b8c8880d6439238096b99c3ada3338a7c4c94fec192a7d4c8806f9610c9`，instrumentation hash `a6ac0651d8258c83da0db47accb216c41682df0a1d075768c407b8cfdc939072`，data-scope hash `e89a0a77f6f2ef099f4f68a1838f39574a1caf2747dccf95494d91d7e3153d10`，termination-policy hash `99e34c03e6b15a1bbeedc3040ccd6332d01f2ab6059cce111f978a51e937a7cd`，outer-env hash `cf24c3c5e349e230a9c04223dceb4854bd377915e21f46d830134b085bc3579d`。`externalExecutionAuthorized=false`、外部调用为 0；R5 stop、R4 blocked/pending 与此前五条 stop chain 不变。R6-T4 必须等待绑定上述完整边界的全新 owner authorization。

## R6-T4 — Separately authorized invocation-compatible verdict

### Prompt

- **背景**：R6-T3 将冻结新的 invocation-compatible runner/instrumentation plan。
- **目标**：仅在新的精确 owner authorization 后执行 bounded paired arms，并记录 `R6-RECOVERY` verdict。
- **本阶段做**：pre-spawn compatibility recheck、fresh contexts、deadline/process-tree/retry classification、final-file/JSONL/audit consistency、attempt/batch evidence 与 verdict。
- **本阶段不做**：不覆盖 R5/R4/R3/R2/R1/R0/P0，不自动解锁或创建产品 phase。
- **实现约束**：任何 prereg/source/env/capsule/holdout/deadline/budget/failure-sealing drift fail closed；旧 R5-T4 authorization 无效。
- **验收标准**：immutable verdict；continue 也仅允许提出新的独立研究路线。

> **已完成（2026-07-30）**：Owner 先要求并确认提交 `07ff373` 已推送至 `origin/agent/complete-p0-r1-stages`，随后以完整 preregistration/data-scope/outer-env/termination/process 边界授权 R6-T4；authorization hash 为 `c2f53593214107adeb810172a65072ce91d03d41f664d5d85fbf58c8321d7d74`。Frozen source、preflight 与授权验证通过后启动首个 direct arm；进程取得 fresh thread 并留下重连进度，但在 `120000ms` outer deadline 前没有 provider `turn.failed`、`turn.completed` 或权威 final response。Runner 按冻结策略发送 `SIGTERM`、证明 process group 已清空，并在返回前封存 raw stdout/stderr、empty final observation、ledger、boundary、termination、failure 与双层 SHA evidence；failure codes 为 `R5_FINAL_RESPONSE_EMPTY` / `R5_WALL_CLOCK_DEADLINE`。该分类是明确不可重试的 runner deadline，不是可重试 provider timeout，因此没有启动 retry 或第二个进程。结果位于 `docs/test-evidence/R6-T4/20260730T171100-0800/`，1 个 process attempt、0/10 successful arms，verdict hash `ec823dada3f0da0c442672ce966ca2f6da29446e37066ffe6bb328a02a031388`，如实记录 `R6-RECOVERY` attempt 1 为 `adjust`；R5 stop、R4 blocked/pending、此前 stop chain 与零产品解锁边界不变。

## R6-T5 — Provider retry-horizon / outer-deadline remediation

### Prompt

- **背景**：R6-T4 attempt 1 在 120000ms runner deadline 前只观察到重连进度，按冻结规则以 `adjust` 终止且不可重试。
- **目标**：只使用 immutable R6-T4 evidence，建立 bounded Codex provider retry horizon 与 trusted outer deadline 的显式兼容契约。
- **本阶段做**：重放 receipt ledger/timestamps、区分 provider terminal 与 runner termination、定义有界 deadline margin、保留 process-tree/grace/signal/budget/failure sealing，并增加零模型 synthetic tests。
- **本阶段不做**：不执行 provider/model call，不修改或覆盖 R6-T4 evidence/verdict，不冻结 attempt-two batch，不授权产品工作。
- **实现约束**：不能把重连文本等同于 provider timeout；任何新 deadline 必须有限、可 hash、从 spawn 起 monotonic，且 runner termination 仍不可在原授权下 retry。
- **验收标准**：独立 owner 授权后，本地 remediation 和目标测试通过；下一项仅为 R6-T6。

> **已完成（2026-07-30）**：已仅从 immutable R6-T4 `RESULTS.sha256`、receipt ledger、raw JSONL、boundary/termination/final/verdict evidence 做逐条哈希校验与 trusted monotonic replay；确认进程 spawn 后 `75498ms`、`90905ms`、`106691ms` 分别观察到 reconnect 2/5、3/5、4/5，而 runner 在 `120005ms` 终止且始终没有 provider terminal 或权威 response。重连文本仍只构成不完整 lower bound，不授权 retry；attempt 1 继续是不可覆盖、不可重试的 runner-deadline `adjust`。兼容契约要求 R6-T6 提供来自 explicit provider config 或 version-bound Codex instrumentation 的显式 retry horizon，当前证据给出的最小 horizon/观察余量/outer deadline 分别为 `120006ms` / `31574ms` / `151580ms`，outer deadline 上界为 `600000ms`；`5000ms` grace、`5000ms` force observation、`SIGTERM`→`SIGKILL`、每 arm 最多一次 sealed observed provider-timeout retry、全批 20-process cap 与逐 attempt evidence/budget 语义不变。证明位于 `docs/test-evidence/R6-T5/20260730T174418-0800/`，proof hash `82585caca431e25e6bc0f8a7737cdab4a437ecd5cf8ebbb88eb6158c5c719fcb`，compatibility-contract hash `6145537843ed5c35297196ec0dee74f618f0dd17bc9d89dcfa7bab87a07db4c2`。7 项定向测试及 61 文件/338 项全仓测试通过；external process/model/provider call 均为 0，未选择具体 attempt-two deadline、未冻结 R6-T6、未授权 R6-T7，也未解锁产品工作。

## R6-T6 — Attempt-two preregistration

### Prompt

- **背景**：R6-T5 已给出经测试的 retry-horizon/deadline compatibility contract，但没有选择或冻结具体 attempt-two policy。
- **目标**：冻结新的 attempt-two runner/source/policy/task/data/evidence plan。
- **本阶段做**：新 source/policy hashes、fresh recovery-only task bank、equal-base capsules、counterbalance、bounded deadline/grace/signal/process budget、attempt-one evidence binding 和 external authorization gate。
- **本阶段不做**：不执行外部 arm，不复用 R6-T4 authorization，不覆盖 attempt 1，不消费产品 holdout。
- **实现约束**：`externalExecutionAuthorized=false`；attempt 1 evidence/hash immutable；任何 policy/source/data drift fail closed。
- **验收标准**：新预注册与本地 probes 通过后 `done`；R6-T7 等待绑定全部新边界的单独授权。

> **已完成（2026-07-30）**：已冻结独立 R6-T7 attempt-two runner、13 项 runtime source closure、5 个全新 deadline-remediation tasks / 10 个 counterbalanced arms、equal-base read-only capsules、withheld ground truth、product-holdout exclusion，以及 decision attempt 2 / `supersedesAttempt=R6-T4` 的 verdict 和 authorization gate。具体 policy 绑定 Codex `0.144.5` 的 version-bound instrumentation，选择 `480000ms` bounded observation horizon + `120000ms` terminal-observation margin = 从 participant spawn 起 `600000ms` outer deadline；这只是有限观察策略，不声称 provider 内部 retry schedule。原 `5000ms` grace、`5000ms` force observation、`SIGTERM`→`SIGKILL`、仅 sealed observed provider timeout 可 retry 一次、runner deadline 不可 retry、20-process cap 与逐 attempt evidence/budget 语义全部保留。正式预注册位于 `docs/test-evidence/R6-T6/20260730T180734-0800/`：preregistration hash `41ce5ab1a65437defdfcd86c0b4ec4db3e922af8a6c5e5642d44384ea910627e`，instrumentation hash `c3c4f3bc1d7e9592e197705592606bbefba67d71fb22c526df5d8b4fe4748d48`，data-scope hash `aab9e34e3dd6074ea691cf453823dd59d08e7bbe2ee6b4eb37b7e82507c648cd`，deadline-candidate hash `dd11e6718e0d0e907fd883195be2b62ee03a963549acd9c056b06a8a65e81be4`，termination-policy hash `76b982ab7c12d5da5210f338b8f620f47506db6b99f47261634dea40dc1e7850`，outer-env hash `cf24c3c5e349e230a9c04223dceb4854bd377915e21f46d830134b085bc3579d`。30 个本地 probes、35 项 R6/terminalizer 定向测试及 62 文件/342 项全仓测试通过；R6-T4/R6-T5 hashes 未变，`externalExecutionAuthorized=false`、外部模型调用为 0、产品解锁为 0。R6-T7 必须等待绑定全部新 hashes、具体 deadline 和 process cap 的另一份精确 owner authorization。

## R6-T7 — Separately authorized attempt-two verdict

### Prompt

- **背景**：R6-T4 attempt 1 为 immutable `adjust`，R6-T6 已冻结 remediation 后的 attempt-two plan，但没有授权执行。
- **目标**：仅在新的精确 owner authorization 后执行 bounded attempt-two arms，并记录 `R6-RECOVERY` 当前 verdict。
- **本阶段做**：fresh contexts、provider-terminal/runner-deadline separation、process-tree/retry/final-file/JSONL/audit consistency、attempt/batch evidence 与 pairwise verdict。
- **本阶段不做**：不覆盖 R6-T4 或此前 R5/R4/R3/R2/R1/R0/P0 evidence/decision，不自动解锁产品 phase。
- **实现约束**：`decision_attempt: 2`、`supersedes_attempt: R6-T4`；只有 sealed observed provider timeout 可按新 policy 重试，runner termination 不可冒充 provider terminal。
- **验收标准**：immutable attempt-two verdict；只有 `continue` 满足 R6 gate，且也只允许提出新的独立研究路线。

> **已完成（2026-07-30）**：已按 owner 绑定的 commit `ec16d64174951036555c4297858547b0fe5e8c59`、完整 preregistration/instrumentation/data-scope/deadline/environment hashes 与 `600000/5000/5000ms` termination policy 执行 attempt 2。首个 direct arm 使用 fresh thread `019fb298-81a7-7d52-b116-3d415393d847`；trusted receipt 依次观察到 WebSocket reconnect 2/5、3/5、4/5、5/5，约 `137057ms` fallback HTTPS，再观察 HTTPS reconnect 1/5、2/5、3/5，最终在约 `599996ms` 发送 `SIGTERM`。全过程没有 provider `turn.failed`、`turn.completed`、agent message 或权威 final response；process group 已清空，raw/ledger/final/boundary/termination/failure 与双层 SHA evidence 均在返回前封存。该结果是不可重试的 runner deadline termination，不是真实观察到的 provider timeout，因此没有 retry 或下一 arm：共 1 个 external process、0/10 successful arms、剩余 19 个 process budget。证据位于 `docs/test-evidence/R6-T7/20260730T183547-0800/`；authorization canonical hash 为 `a11336fb6fa5f11b5eb7a2b5f6471be1612617367e172d28899d3be08be82f2a`，canonical verdict hash 为 `254a47f33b9a1348e87eef99181e7c581d0a244ef1a154119240c1c8e481a961`，immutable attempt 2 verdict 为 `adjust`。Attempt 1 未覆盖、产品工作未解锁；下一步必须先单独授权 R6-T8 本地 dual-transport horizon remediation。

## R6-T8 — Dual-transport terminal-horizon remediation

### Prompt

- **背景**：R6-T7 attempt 2 在冻结上限 `600000ms` 内完成 WebSocket 5/5 并 fallback HTTPS，但仅观察到 HTTPS reconnect 3/5，仍未取得 provider terminal。
- **目标**：只读重放 immutable R6-T7 evidence，建立同时覆盖 WebSocket 与 HTTPS fallback phase 的显式 terminal-horizon compatibility disposition。
- **本阶段做**：验证 attempt 1/2 manifests 与 receipt/raw 对应关系；按 trusted ordered receipt sequence 区分跨 transport 的重复 reconnect payload/hash；计算已观察 lower bound，并给出新的有限 deadline compatibility contract 或证据支持的 `stop` disposition。
- **本阶段不做**：不执行外部 model/provider call，不覆盖 attempts 1/2，不选择 attempt-three runner，不授权产品工作。
- **实现约束**：相同 raw hash 不能被假设为同一个 transport phase；transport attribution 必须来自 ordered receipt sequence 与相邻明确 fallback evidence；runner termination 仍不可重试。
- **验收标准**：独立 owner 授权后，本地 proof、immutability checks 与目标测试通过；只有可审计的 bounded remediation 才允许进入 R6-T9。

> **已完成（2026-07-30）**：Owner 要求先 commit/push，R6-T7 完整结果已提交为 `d3dca37e0aa2560238e81bc6639081cb6ecd321f` 并与远端分支 SHA 核对一致；随后按本次授权仅执行 R6-T8 本地 replay。实现按 stdout JSONL chunk 的 ordered occurrence 与 receipt 一一对应，并以唯一 fallback receipt 分隔 transport phase；确认 WebSocket reconnect 2/5–5/5、`137057ms` fallback、HTTPS reconnect 1/5–3/5，同时正确保留两个跨 transport 重复 raw hash，未把 hash 当作唯一 receipt identity。Immutable attempts 1/2 manifests、terminal/final/audit/permission 状态全部通过；`600000ms` 仍只是 incomplete lower bound，没有 provider terminal，也不授权 retry。新 compatibility contract 要求 attempt-three explicit terminal horizon 至少 `600001ms`、observation margin 至少 `308226ms`、outer deadline 为 `908227..1200000ms`；R6-T8 不选择具体 policy，`externalExecutionAuthorized=false`。证据位于 `docs/test-evidence/R6-T8/20260730T191632-0800/`，proof hash `21cb7550bc5380f0f460efbf59672ebf9bbaa28a78bbf8ce2e2053ddf73296be`，contract hash `35a851a8e80785ca92e57f6e8468b183a217eb31e7ad8d7ec212b3f8f850685e`。11 files / 70 项定向测试及 64 files / 350 项全仓测试通过，build/typecheck/lint/roadmap validation 通过；外部模型调用和产品解锁均为 0。下一项 R6-T9 仍需单独授权。

## R6-T9 — Attempt-three preregistration

### Prompt

- **背景**：R6-T8 将决定是否存在可接受的 attempt-three dual-transport deadline envelope；它不选择具体 runner policy。
- **目标**：仅在 R6-T8 允许继续时，冻结 fresh attempt-three tasks/arms、runner/source closure、explicit horizon provenance、deadline candidate、termination policy、data scope 与 evidence gate。
- **本阶段做**：新 task identity、equal-base contexts、counterbalance、holdout exclusion、process budget、attempt 1/2 immutability、`decision_attempt: 3` / `supersedes_attempt: R6-T7` 和 `externalExecutionAuthorized=false`。
- **本阶段不做**：不执行外部 arm，不复用 R6-T7 authorization，不覆盖 attempts 1/2，不消费产品 holdout。
- **实现约束**：R6-T8 disposition、全部 source/policy/data/environment hashes 与 ordered dual-transport horizon binding 必须 fail closed。
- **验收标准**：单独 owner 授权后，新预注册与本地 probes 通过；R6-T10 等待绑定全部新边界的另一份精确外部授权。

## R6-T10 — Separately authorized attempt-three verdict

### Prompt

- **背景**：仅当 R6-T8 remediation 与 R6-T9 no-call preregistration 均完成后，attempt 3 才具有结构资格；当前没有执行授权。
- **目标**：仅在新的精确 owner authorization 后执行 bounded attempt-three arms，并记录 `R6-RECOVERY` 当前 verdict。
- **本阶段做**：fresh contexts、dual-transport/provider-terminal/runner-deadline separation、process-tree/retry/final-file/JSONL/audit consistency、attempt/batch evidence 与 pairwise verdict。
- **本阶段不做**：不覆盖 R6-T7、R6-T4 或此前 R5/R4/R3/R2/R1/R0/P0 evidence/decision，不自动解锁产品 phase。
- **实现约束**：`decision_attempt: 3`、`supersedes_attempt: R6-T7`；只有 sealed observed provider timeout 可按新 policy 重试，runner termination 不可冒充 provider terminal。
- **验收标准**：immutable attempt-three verdict；只有 `continue` 满足 R6 gate，且也只允许提出新的独立研究路线。

## P0-T9A — Walking-skeleton 正向 Edge E2E

### Prompt

- **背景**：selector、coordinator、prepare/update/complete seams 已分别存在。
- **目标**：只证明一次真实 Edge、双进程、单次确认、相关 HMR 和文本断言正向闭环。
- **本阶段做**：select→展示/确认→claim→prepare→edit fixture→test→related HMR→complete。
- **本阶段不做**：不做 restart/无关更新负例，不跑 golden corpus，不加入截图/style。
- **实现约束**：ConfirmationBinding 单次消费；真实 Vite/MCP OS process；fresh before/after observation。
- **成功路径**：正确 source、正确 transaction、文本 assertion passed，所有 evidence 可解释。
- **失败路径与边界**：确认、claim、HMR、direct/transaction-matched reattach、test 任一失败返回真实 terminal state；无法唯一证明 successor 时返回 `target-changed/ambiguous` 并重新选择，不按相似度挑选 alternative。
- **建议优先查看/修改的文件**：`e2e/`、demo fixture、coordinator/MCP/verification 测试。
- **测试要求**：Edge Stable channel、two-process、single-use confirmation、production fixture cleanup。
- **验收标准**：仅一个正向垂直用例通过，不外推 golden 或可靠性结论。

## P0-T9B — Restart 与错误归因负向 Edge E2E

### Prompt

- **背景**：正向 walking skeleton 已通过，但 restart/stale/unrelated update 尚未证明。
- **目标**：只证明 project-instance restart、stale confirmation/session 和无关更新不会误通过。
- **本阶段做**：MCP/Vite restart、旧 instance/claim/confirmation、无关 HMR、相关与无关交错测试。
- **本阶段不做**：不扩展 golden 数量，不改变匹配算法，不加入视觉能力。
- **实现约束**：zero false-positive passed；旧 confirmation terminal invalidated；不得自动重绑 active selection。
- **成功路径**：负例得到 stale/ambiguous/timeout 等预期状态。
- **失败路径与边界**：任何错误 passed 立即阻断，不降级成 warning。
- **建议优先查看/修改的文件**：Edge E2E、journal/update matcher、confirmation store fixtures。
- **测试要求**：restart IDs、A/B transactions、stale document、confirmation replay。
- **验收标准**：所有预登记负例无 false positive。

## P0-T9C — P0 golden evidence verdict

### Prompt

- **背景**：E2E 能力已证明，现独立评估 10–20 个预登记任务。
- **目标**：只执行和汇总 P0 golden baseline。
- **本阶段做**：冻结 corpus/threshold；记录 direct-primary exact、仅在 direct 不可用时的 degraded top-k、target-changed reselection、ambiguity correctness、false-positive passed 和原始 hashes。
- **本阶段不做**：不改产品实现/fixture ground truth，不用结果调参，不扩大能力声明。
- **实现约束**：evidence 与实现 commit 分离；错误 passed 必须为 0。
- **成功路径**：达到 threshold 并生成可审计 verdict。
- **失败路径与边界**：不达标时 failed/adjust，不删除困难样本。
- **建议优先查看/修改的文件**：`benchmarks/golden-tasks/`、P0 gate evidence、progress/roadmap。
- **测试要求**：corpus hash、threshold immutability、metric recomputation、zero-false-positive gate。
- **验收标准**：任务完成后设为 `status: done` 并记录 `decision`；只有 `decision: continue` 才允许 P0 phase gate。

## P1-T18A — Upgrade/migration/rollback

### Prompt

- **背景**：injected preview CLI 已可安装，但升级是独立失败域。
- **目标**：只实现版本兼容检查、migration dry-run、upgrade 和 rollback。
- **本阶段做**：检测旧版本；列出修改；原子应用；失败回滚；保留用户文件。
- **本阶段不做**：不实现 uninstall，不做生产残留总验收。
- **实现约束**：项目内 allowlist；幂等；备份/rollback 有界；许可证状态允许分发。
- **成功路径**：supported upgrade 完成且重复运行无变化。
- **失败路径与边界**：unsupported/corrupt/partial write 安全回滚，不猜测修复。
- **建议优先查看/修改的文件**：CLI installer/migration、version manifest、fixtures。
- **测试要求**：dry-run、upgrade matrix、partial failure、rollback、user-file preservation。
- **验收标准**：升级能力独立可验收；未声称 clean uninstall。

## P1-T18B — Clean uninstall 与残留验证

### Prompt

- **背景**：升级路径已独立完成，需证明卸载不会损坏用户项目。
- **目标**：只实现 clean uninstall 和 production/runtime/data residue 检查。
- **本阶段做**：按安装 provenance 移除 VEM 自有配置/依赖/生成物；保留用户内容；清理 runtime/data；执行 production module-graph、baseline equivalence 与 VEM-owned signature 的只读检查。
- **本阶段不做**：不改变 upgrade/migration，不发布 package。
- **实现约束**：幂等；仅删除有 provenance 的 VEM 内容；不按模糊名称删除用户 attribute/file。
- **成功路径**：安装前后用户项目等价，VEM residue 为 0。
- **失败路径与边界**：所有权不明时停止并报告 manual action，不强删。
- **建议优先查看/修改的文件**：CLI uninstall、install manifest、production non-participation/leakage tests。
- **测试要求**：double uninstall、modified config、user same-name file、runtime/data cleanup、build scan。
- **验收标准**：卸载与残留门禁独立通过。

## P2-T13A — 可复现 Edge sideload 包

### Prompt

- **背景**：extension/security tests 已通过，先独立交付可重复构建的开发包。
- **目标**：只生成 reproducible Edge sideload package 和 setup guide。
- **本阶段做**：固定 inputs/version；构建 manifest/package；记录 hashes；fresh profile sideload smoke。
- **本阶段不做**：不评估 pairing/revoke，不做 upgrade/uninstall。
- **实现约束**：最小权限、Edge-first manifest、license/notices 完整、不含 secret。
- **成功路径**：同 commit/environment 生成相同内容 hash，fresh profile 可加载。
- **失败路径与边界**：manifest/CSP/permission/version 不符即失败。
- **建议优先查看/修改的文件**：browser-extension build、manifest、packaging docs/evidence。
- **测试要求**：reproducibility、manifest/CSP、package contents、fresh sideload。
- **验收标准**：只声明 package/installability。

## P2-T13B — Fresh pairing、恢复与 revoke

### Prompt

- **背景**：可复现 sideload 包已存在，配对是独立安全失败域。
- **目标**：只验证 fresh profile 首次配对、预期失败恢复和 revoke。
- **本阶段做**：terminal code、user confirmation、token issuance、失败恢复、revoke、no-live-token 检查。
- **本阶段不做**：不做 extension upgrade 或 uninstall。
- **实现约束**：SEC-PAIR-001 全部适用；不把 scoped bearer 称为 PoP。
- **成功路径**：fresh pair 成功，错误 code/restart 可恢复，revoke 立即生效。
- **失败路径与边界**：任何静默配对、重放或残留 live token 阻断。
- **建议优先查看/修改的文件**：pairing E2E、popup、coordinator auth evidence。
- **测试要求**：wrong/expired/concurrent code、restart、scope、revoke。
- **验收标准**：配对生命周期独立通过。

## P2-T13C — Extension upgrade 与 clean uninstall

### Prompt

- **背景**：package 与 pairing 已分别通过，最后验证版本迁移和清理。
- **目标**：只验证 extension upgrade/rollback/uninstall residue。
- **本阶段做**：upgrade/reload、storage access level、token invalidation、permission/runtime/data cleanup。
- **本阶段不做**：不增加 pairing 功能，不发布商店版本。
- **实现约束**：update 后重新认证；不能恢复旧 token；用户配置保留规则明确。
- **成功路径**：upgrade 后安全重新配对；uninstall 后无 VEM/token/runtime residue。
- **失败路径与边界**：migration 不明或 access level 扩大时 fail closed/rollback。
- **建议优先查看/修改的文件**：extension migration、storage tests、uninstall guide/evidence。
- **测试要求**：upgrade generations、rollback、storage visibility、uninstall residue。
- **验收标准**：开发分发生命周期完整但不声称 store release。

## P2-T13D — Fresh-profile lifecycle evidence verdict

### Prompt

- **背景**：package、pair/recovery/revoke、upgrade/uninstall 已分别通过，但 task 完成不自动授权进入视觉基础设施。
- **目标**：只依据预登记 fresh-profile evidence plan 汇总并给出 continue/adjust/stop verdict。
- **本阶段做**：冻结 threshold 与输入 hash；重算 install、pair failure/recovery、revoke、upgrade/uninstall residue 指标；记录 verdict 与原始 evidence references。
- **本阶段不做**：不修改 extension/coordinator、阈值、样本或 ground truth，不开始 P3。
- **实现约束**：任何缺失/污染/stale evidence 都不能得到 continue；安全失败不能用平均成功率掩盖。
- **成功路径**：所有 required outcome 和安全阈值通过，`decision: continue`。
- **失败路径与边界**：不达标时如实 `adjust/stop`，即使 task 自身仍可因评估完整而 `done`。
- **建议优先查看/修改的文件**：P2 evidence plan、P2-T13A–C evidence、progress/roadmap。
- **测试要求**：immutability、hash/recompute、fresh-profile proof、security threshold、residue、decision calculation。
- **验收标准**：只有本任务的 `decision: continue` 允许 P2 phase gate。

## P3-T8A — Edge real-pixel visual proof

### Prompt

- **背景**：capture lane、race protections、style/geometry 已存在。
- **目标**：只证明一个真实像素 capture + objective geometry prepare/complete 垂直切片。
- **本阶段做**：consent、captureEpoch、mask/crop、resource read、geometry assertion、needs-review boundary。
- **本阶段不做**：不建设 50-task corpus，不给出 beta verdict，不实现 durable artifact。
- **实现约束**：CAP-RACE-001；memory-first resource；任何 race 丢弃像素。
- **成功路径**：Edge 正确 target capture 与 objective assertion 可复核。
- **失败路径与边界**：A-B-A、navigation、mask/dynamic pixel、quota 失败不得上传/通过。
- **建议优先查看/修改的文件**：capture provider、visual E2E fixture、resource store。
- **测试要求**：real Edge、race suite、mask-before-upload、TTL/quota、objective assertion。
- **验收标准**：一个真实 visual proof 通过，不包含 corpus 结论。

## P3-T8B — 50-task visual golden corpus

### Prompt

- **背景**：visual proof 已存在，需单独建设不与实现调参混合的 corpus。
- **目标**：只建立至少 50 个分类任务、ground truth 与 holdout exclusion。
- **本阶段做**：覆盖设计 matrix；固定 task/fixture/ground-truth hashes；标注 capability unavailable/ambiguous expected states。
- **本阶段不做**：不执行最终 verdict，不修改 capture/mapper 实现。
- **实现约束**：调参集与 holdout 身份分离；不得把困难 case 删除。
- **成功路径**：corpus schema、类别覆盖和 ground truth review 通过。
- **失败路径与边界**：来源不明 asset、重复样本、ground truth 歧义必须修正或标注，不伪造答案。
- **建议优先查看/修改的文件**：`benchmarks/golden-tasks/`、fixtures、evidence plan。
- **测试要求**：count/category coverage、hash、duplicate detection、holdout separation。
- **验收标准**：corpus 可供 P3-T19 消费，但无产品效果 verdict。

## P3-T16 — Fallback 与默认开启增强保障偏好

### Prompt

- **背景**：FallbackPolicy 已区分 strict/balanced/compatibility，但不能被实现成 `security: off` 或“可信本机”逐层绕过；性能诉求只允许作用于安全底线之外的增强检查。
- **目标**：记录 FALLBACK-POLICY-001 ADR，并交付 CapabilityRegistry、fallback 选择和按 project/browser profile 作用域的默认开启增强保障偏好。
- **本阶段做**：锁定增强项名称、trusted configuration source、scope、默认值、逐项 opt-out、UI/CapabilityReport 表达和 limitation；实现 strict/balanced/compatibility provider 选择。
- **本阶段不做**：不允许页面修改策略，不增加全局 security-off，不关闭身份/认证/授权/schema/隐私/路径/replay/revision/confirmation/capture/remote/production safety floor，不把增强项关闭解释为更高信任。
- **实现约束**：关闭增强项只能减少额外交叉验证、只读主动 revalidation、扩展诊断或本地 audit metadata；不得提升 confidence/freshness、扩大权限、减少必需确认或让 verification 更容易 passed。
- **成功路径**：默认配置启用全部声明的增强项；用户从受信任设置逐项关闭后，CapabilityReport/UI 显示有效 scope 与 limitation，底线测试结果不变。
- **失败路径与边界**：全局关闭、trusted-local bypass、页面发起配置、未知增强项、scope 串项目或关闭后结果升级均 fail closed。
- **建议优先查看/修改的文件**：fallback ADR、CapabilityRegistry、trusted config schema、CapabilityReport、扩展设置 UI 与 policy fixtures。
- **测试要求**：strict/balanced/compatibility、forbidden downgrade、default-on、per-check opt-out、trusted-config-only、scope isolation、visible limitation、no confidence/permission/pass upgrade 和底线持续执行。
- **验收标准**：一个可审计的能力/保障策略 surface 通过；没有创建绕过安全底线的模式。

## P4-T6A — Visual V1 Edge 环境矩阵

### Prompt

- **背景**：advanced style/stabilization 已存在，需要先独立验证环境变量矩阵。
- **目标**：只执行 Edge zoom/DPR/scroll/responsive style-layout E2E matrix。
- **本阶段做**：固定 OS/Edge/font/viewport；测试 zoom、DPR、scroll、responsive；保存 crop/assertion evidence。
- **本阶段不做**：不做 fresh install/uninstall，不执行 holdout release verdict。
- **实现约束**：跨环境 baseline 不混用；主观项保持 needs-review。
- **成功路径**：所有承诺矩阵 cell 达到 objective expectations。
- **失败路径与边界**：环境漂移、字体缺失、crop mismatch 分类别失败。
- **建议优先查看/修改的文件**：visual-v1 E2E config、fixtures、evidence matrix。
- **测试要求**：zoom/DPR/scroll/viewport metadata、crop calibration、style/layout assertions。
- **验收标准**：环境矩阵通过但不等于 Visual V1 release。

## P4-T6B — Fresh install 到 clean uninstall 的单任务旅程

### Prompt

- **背景**：Edge 环境矩阵和开发分发 lifecycle 已分别通过。
- **目标**：只验证 fresh project/profile 的 install→pair→select→one visual task→revoke→uninstall。
- **本阶段做**：使用未预装环境；记录每一步成功/失败/恢复和全部 residue。
- **本阶段不做**：不运行独立 holdout，不调参产品实现。
- **实现约束**：同一用户旅程；不可跳过首次确认/consent；卸载保留用户文件。
- **成功路径**：完整旅程完成且 residue 为 0。
- **失败路径与边界**：任何人工隐式预配置、旧 profile/cache 使 evidence 无效并重跑。
- **建议优先查看/修改的文件**：fresh-install harness、journey evidence、uninstall residue checks。
- **测试要求**：freshness proof、pair/revoke、visual task、production/runtime/storage cleanup。
- **验收标准**：只证明一条 fresh journey。

## P4-T6C — Visual V1 holdout release verdict

### Prompt

- **背景**：功能矩阵和 fresh journey 已完成，最终 verdict 必须与实现隔离。
- **目标**：执行预登记 Visual V1 holdout 并给出 release/adjust/stop。
- **本阶段做**：验证 threshold/holdout immutability；执行任务；汇总 source、visual、install、edit disposition、residue 和 false-positive metrics。
- **本阶段不做**：不修改实现、阈值、样本或 ground truth，不把 pilot 观察写成普遍百分比。
- **实现约束**：false-positive `passed` 必须为 0；原始 evidence hashes 可重算。
- **成功路径**：全部预登记 threshold 通过，形成 release evidence。
- **失败路径与边界**：不达标即 adjust/stop，不以后验排除样本制造 passed。
- **建议优先查看/修改的文件**：P4 evidence plan、holdout bundles、release summary、progress/roadmap。
- **测试要求**：immutability、metric recomputation、holdout contamination、zero-false-positive gate。
- **验收标准**：任务完成后记录 `decision`；只有 `decision: continue` 可以把 P4 标为 passed/Visual V1 capability-ready。

## P0-T12A — MCP initialization 与静态 CapabilityReport

### Prompt

- **目标**：只交付 primary/compat initialization、no-task core path 与最小静态诚实 CapabilityReport。
- **不做**：不实现 selection claim、ConfirmationBinding 或 source-resolution tools。
- **约束/测试**：覆盖 revision negotiation、compatible text、cancellation；后期能力必须显示 unavailable/limited。
- **验收**：没有 consumer persistent state 或 source tool surface，初始化矩阵可独立通过。

## P0-T12B — Consumer claim 与 ConfirmationBinding lifecycle

### Prompt

- **目标**：只交付 transport-derived consumer identity、immutable selection claim 与单次 ConfirmationBinding 状态机。
- **不做**：不实现 source-resolution tools/resources 或 verification journal。
- **约束/测试**：snapshot/source/candidate/action hash、TTL、reserve/consume、冲突、disconnect/restart clear 与一致 terminal state 全部 fail closed。
- **验收**：identity/claim/confirmation 可独立验收，P0-T12C 可消费其窄接口。

## P0-T12C — Bounded source-resolution MCP surface

### Prompt

- **目标**：只交付 read/metadata-oriented bounded tools/resources，以及 evidence/privacy/compatibility output。
- **不做**：不修改 consumer lifecycle，不进入 verification prepare/HMR。
- **约束/测试**：tool allowlist、PRIV-MIN projection、EvidenceGraph provenance、structured/compatible text、resource expiry、VemError 与 cancellation。
- **验收**：MCP source smoke 可复核，未获得 filesystem/shell/arbitrary URL 能力。

## P7-T3A — Least-privilege container workflow

### Prompt

- **目标**：只实现固定 image digest、non-root、drop capabilities、no privileged/socket、exact-project mount、bounded secret/network 与 cleanup 的 container workflow。
- **约束/测试**：按 `CONTAINER-SEC-001` 覆盖 path/symlink、read-only root、UID、mount、network、secret 与 cleanup；不得以 SSH/remote smoke 作为通过证据。

## P7-T3B — Host-key-verified SSH-stdio workflow

### Prompt

- **目标**：只实现 SSH-stdio，并验证 host key、exact host/project、短期认证、撤销和 cleanup。
- **约束/测试**：按 `REMOTE-SEC-001` 覆盖 mismatch/replay/expiry/no-silent-fallback；不得以 container 或 HTTPS/WSS 证据替代。

## P7-T9A — Public npm distribution

### Prompt

- **目标**：只发布 public npm package；验证 license/provenance、metadata、clean install/upgrade/uninstall、rollback/residue 与 migration docs。

## P7-T9B — Codex plugin distribution

### Prompt

- **目标**：只发布/验证 Codex plugin；覆盖 manifest、package compatibility、install/configuration/upgrade/uninstall。npm 成功不等于 plugin 成功。

## P7-T9C — Microsoft Edge Add-ons distribution

### Prompt

- **目标**：只发布/验证 Edge Add-ons；覆盖 store metadata、permission/privacy disclosure、install/upgrade/uninstall 与 release evidence。不得以后续 Chrome 结果替代。

## P7-T9D — Chrome Web Store distribution

### Prompt

- **目标**：只发布/验证 Chrome Web Store compatibility；覆盖 metadata、manifest compatibility、install/upgrade/uninstall。失败不重写 Edge/npm/plugin evidence。

## P8-T3A — Svelte adapter evaluation

### Prompt

- **目标**：只评估 Svelte；输出 truthful CapabilityReport、unsupported/degraded 行为及 privacy/evidence/verification/production-leakage fixtures。
- **边界**：feasibility 失败是有效结论，不得把 unsupported 标成 supported 来完成。

## P8-T3B — Astro adapter evaluation

### Prompt

- **目标**：只评估 Astro islands 与 server/client evidence boundary；独立输出 CapabilityReport 和安全/验证/production fixtures。
- **边界**：不得复用 Svelte 结论，失败必须保持明确 unavailable/degraded。
