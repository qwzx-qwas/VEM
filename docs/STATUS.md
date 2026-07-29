# Current Project Status

> 人类可读快照。机器可读 task、phase 和 decision 状态以根目录 `ROADMAP.yaml` 为准。

## 当前结论

- 项目处于 design baseline 1.14，P0 implementation 已开始。
- `P0-T0A0` 已完成只读 migration readiness inventory；证据位于 `docs/test-evidence/P0-T0/20260728T155608+0800/`。
- 136 个 roadmap task 和 25 个 contract 已登记。
- `P0-T0A1` 已完成 owner-authorized layout commit 与 single-writer cutover；canonical writer 是 `/home/qwzx/src/VEM`，`/mnt/d/VEM` 仅保留为只读 rollback。
- `P0-T0A2` 已完成：bounded evidence schema/validator、Node `24.18.0` 与 pnpm `10.34.0` 的 owner-accepted exact bootstrap decision 及验证证据位于 `docs/test-evidence/P0-T0/20260728T194140+0800/`。
- `P0-T0B` 已完成：default-CA registry、隔离 Corepack/pnpm frozen install、ext4 case/symlink/long-path 和 native watcher profile 均通过，证据位于 `docs/test-evidence/P0-T0/20260728T195939+0800/`。
- `P0-T0C` 已完成：Windows Edge Stable `150.0.4078.99` 经 WSL direct headless smoke 返回预期 DOM sentinel；ExecutionPolicy `Restricted` 未被绕过，企业策略分类为 unmanaged，task-owned profile/process 均零残留；证据位于 `docs/test-evidence/P0-T0/20260728T204048+0800/`。
- `P0-T0D` 已完成：真实 Windows Edge 经 localhost 到达 WSL Node HTTP/WebSocket，canonical ext4 `fs.watch` update 获得浏览器 ACK/DOM sentinel；同一随机端口完成两个不同 WSL PID/generation 的关闭重启，非 loopback 拒绝且所有资源零残留，证据位于 `docs/test-evidence/P0-T0/20260728T211720+0800/`。
- `P0-T0E` 已完成：XDG tmpfs 候选被显式拒绝后选择 ext4 `/home/qwzx/.cache/vem`，0700 task directory/0600 fixture 和 owner read/write 通过；WSL root 降权到 UID 65534 后 traverse/read/write/create 全部拒绝，Windows `9p` mount 不被接受为 ACL evidence，现有 runtime 根保持不变且零残留；证据位于 `docs/test-evidence/P0-T0/20260728T213829+0800/`。
- `P0-T0F` 已完成：固定聚合 P0-T0A0–E 七个 immutable evidence bundle，manifest/artifact、root/owner/ext4、版本、时间、layout ancestry 与 roadmap 状态全部通过；bootstrap aggregate verdict 为 `passed`，canonical digest 为 `1f77525ea06e3a1525cb54c8a3bd401d0753b8384a45970b930a0626d710d4ff`，证据位于 `docs/test-evidence/P0-T0/20260728T215135+0800/`。
- `P0-T1` 已完成：private pnpm/TypeScript workspace 固定 Node `24.18.0`、pnpm `10.34.0`、TypeScript `6.0.3`、Vitest `4.1.10` 与 ESLint `10.8.0`；clean offline frozen install、8 项 workspace/license 测试、build/typecheck/lint、130 个依赖记录与 vendored-asset 门禁均通过，证据位于 `docs/test-evidence/P0-T1/20260729T103857+0800/`。
- `P0-T0G` 已完成：锁定 Playwright `1.62.0`，以校验官方哈希的任务专用 Windows Node `24.18.0` 通过真实 `channel: msedge` 驱动 Edge Stable `150.0.4078.105`；headed/headless、unmanaged policy 分类、独立 profile 与进程/临时目录清理全部通过，证据位于 `docs/test-evidence/P0-T0/20260729T110955+0800/`。
- 当前下一项为 `P0-T2`：实现 REQ-TRACE-001 roadmap/requirements/contract/link/decision-dependency validator；P0-T3/P0-T4 也已满足 task dependency，但按 roadmap 顺序不并行执行。
- readiness 结果为 `ready`：大小写 staging 路径为同一 device/inode，payload 与 prefix-normalized manifest 已冻结，无 case collision，目标不存在，ext4 容量/owner permission 通过，且目标未被任务修改。
- 当前 owner-approved 产品范围是 P0 proof-of-value / go-no-go prototype，不是完整 Visual V1。
- 安全策略边界已确定但尚未实现：没有全局 security-off/trusted-local 绕过；P3 只为默认开启的增强保障项提供逐项用户 opt-out，并保持安全底线始终执行。
- P6 backlog 已明确：持久资源默认使用每用户托管目录，允许可信本机配置自定义 artifact root，并支持有界、规范化、copy-on-import 的用户参考图；外部文件链接和远程 URL 导入仍未承诺。
- P6 视觉参考采用独立、非授权的 `VisualReferenceBinding`：未绑定图不声称源码关系，用户控制参考任务的 pause/resume/complete/cancel/replace/renew，指导期限与 artifact 保留期限分离。
- 源码沟通以当前 direct primary source 为正常路径；prepared verification 只接受 direct/transaction-matched reattachment，无法唯一证明 successor 时要求重新选择，revision history 不冒充源码撤销。
- `PROD-LEAK-001` 采用 MCP/Coordinator/extension/Vite dev integration 的开发平面隔离与生产不参与；门禁只读检查生产 module graph、baseline build equivalence 和 VEM-owned signatures，不清洗 `dist`。

## 当前写入边界

- 当前 staging display path 是 `/mnt/d/VEM`；大小写别名要按 Git top-level 与 device/inode 判断。
- owner migration target 是 `/home/qwzx/src/VEM`。
- P0-T0A1 已完成 target migration 与 single-writer cutover；所有后续写入只发生在 canonical target，staging 继续只读保留。
- 1.13 视觉参考绑定与双生命周期设计修订新增 P6-T14；本次 1.14 只收敛 revision reattachment、confirmation 和 production non-participation 语义，没有改变任何 roadmap task、phase 或 decision 状态。

## 当前待 owner 决策

见 `docs/decisions/OPEN_DECISIONS.yaml`。迁移、exact toolchain 与 Apache-2.0 项目许可证记录均已完成；MCP primary/compat revision 仍按 P0-T3 的时点待决。

## 状态与记录分工

- `ROADMAP.yaml`：唯一任务、阶段、decision 状态源。
- `docs/progress.md`：只保存 implementation task 的完成/阻塞证据。
- `docs/checkpoints/`：只保存 `in_progress` 任务的可续接位置，不表示完成。
- `docs/history/DESIGN_CHANGELOG.md`：保存设计 baseline 历史。
