# Atomic Task Prompts

本文件保存从过大 roadmap item 拆出的原子任务及其可直接交给 Codex 的 prompt。`ROADMAP.yaml` 仍是任务状态与依赖的唯一事实来源；本文件不重复状态。执行任何任务前仍须依次读取 `AGENTS.md`、`docs/DESIGN.md`、`docs/requirements.yaml`、`ROADMAP.yaml` 和 `PLANS.md`，确认依赖满足，并且一次只执行一个 task。

所有 prompt 共用以下规则：只改当前 task；先写/更新测试；不得削弱安全、隐私、证据或测试门禁；外部阻塞要保存证据并标记 blocked；通过后才更新 roadmap/progress；结束时使用 `AGENTS.md` 的报告格式。

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

## P0-T0G — Playwright `msedge` 正式 channel gate

### Prompt

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

## P0-T9A — Walking-skeleton 正向 Edge E2E

### Prompt

- **背景**：selector、coordinator、prepare/update/complete seams 已分别存在。
- **目标**：只证明一次真实 Edge、双进程、单次确认、相关 HMR 和文本断言正向闭环。
- **本阶段做**：select→展示/确认→claim→prepare→edit fixture→test→related HMR→complete。
- **本阶段不做**：不做 restart/无关更新负例，不跑 golden corpus，不加入截图/style。
- **实现约束**：ConfirmationBinding 单次消费；真实 Vite/MCP OS process；fresh before/after observation。
- **成功路径**：正确 source、正确 transaction、文本 assertion passed，所有 evidence 可解释。
- **失败路径与边界**：确认、claim、HMR、reattach、test 任一失败返回真实 terminal state。
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
- **本阶段做**：冻结 corpus/threshold；记录 source top-k、ambiguity correctness、false-positive passed 和原始 hashes。
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
- **本阶段做**：移除 VEM 自有配置/依赖/生成物；保留用户内容；清理 runtime/data；执行 production build scan。
- **本阶段不做**：不改变 upgrade/migration，不发布 package。
- **实现约束**：幂等；仅删除有 provenance 的 VEM 内容；不按模糊名称删除用户 attribute/file。
- **成功路径**：安装前后用户项目等价，VEM residue 为 0。
- **失败路径与边界**：所有权不明时停止并报告 manual action，不强删。
- **建议优先查看/修改的文件**：CLI uninstall、install manifest、production leakage tests。
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
