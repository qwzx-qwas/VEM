# Current Project Status

> 人类可读快照。机器可读 task、phase 和 decision 状态以根目录 `ROADMAP.yaml` 为准。

## 当前结论

- 项目处于 design baseline 1.14，P0 implementation 已开始。
- `P0-T0A0` 已完成只读 migration readiness inventory；证据位于 `docs/test-evidence/P0-T0/20260728T155608+0800/`。
- 160 个 roadmap task、14 个 phase 和 30 个 contract 已登记。
- `P0-T0A1` 已完成 owner-authorized layout commit 与 single-writer cutover；canonical writer 是 `/home/qwzx/src/VEM`，`/mnt/d/VEM` 仅保留为只读 rollback。
- `P0-T0A2` 已完成：bounded evidence schema/validator、Node `24.18.0` 与 pnpm `10.34.0` 的 owner-accepted exact bootstrap decision 及验证证据位于 `docs/test-evidence/P0-T0/20260728T194140+0800/`。
- `P0-T0B` 已完成：default-CA registry、隔离 Corepack/pnpm frozen install、ext4 case/symlink/long-path 和 native watcher profile 均通过，证据位于 `docs/test-evidence/P0-T0/20260728T195939+0800/`。
- `P0-T0C` 已完成：Windows Edge Stable `150.0.4078.99` 经 WSL direct headless smoke 返回预期 DOM sentinel；ExecutionPolicy `Restricted` 未被绕过，企业策略分类为 unmanaged，task-owned profile/process 均零残留；证据位于 `docs/test-evidence/P0-T0/20260728T204048+0800/`。
- `P0-T0D` 已完成：真实 Windows Edge 经 localhost 到达 WSL Node HTTP/WebSocket，canonical ext4 `fs.watch` update 获得浏览器 ACK/DOM sentinel；同一随机端口完成两个不同 WSL PID/generation 的关闭重启，非 loopback 拒绝且所有资源零残留，证据位于 `docs/test-evidence/P0-T0/20260728T211720+0800/`。
- `P0-T0E` 已完成：XDG tmpfs 候选被显式拒绝后选择 ext4 `/home/qwzx/.cache/vem`，0700 task directory/0600 fixture 和 owner read/write 通过；WSL root 降权到 UID 65534 后 traverse/read/write/create 全部拒绝，Windows `9p` mount 不被接受为 ACL evidence，现有 runtime 根保持不变且零残留；证据位于 `docs/test-evidence/P0-T0/20260728T213829+0800/`。
- `P0-T0F` 已完成：固定聚合 P0-T0A0–E 七个 immutable evidence bundle，manifest/artifact、root/owner/ext4、版本、时间、layout ancestry 与 roadmap 状态全部通过；bootstrap aggregate verdict 为 `passed`，canonical digest 为 `1f77525ea06e3a1525cb54c8a3bd401d0753b8384a45970b930a0626d710d4ff`，证据位于 `docs/test-evidence/P0-T0/20260728T215135+0800/`。
- `P0-T1` 已完成：private pnpm/TypeScript workspace 固定 Node `24.18.0`、pnpm `10.34.0`、TypeScript `6.0.3`、Vitest `4.1.10` 与 ESLint `10.8.0`；clean offline frozen install、8 项 workspace/license 测试、build/typecheck/lint、130 个依赖记录与 vendored-asset 门禁均通过，证据位于 `docs/test-evidence/P0-T1/20260729T103857+0800/`。
- `P0-T0G` 已完成：锁定 Playwright `1.62.0`，以校验官方哈希的任务专用 Windows Node `24.18.0` 通过真实 `channel: msedge` 驱动 Edge Stable `150.0.4078.105`；headed/headless、unmanaged policy 分类、独立 profile 与进程/临时目录清理全部通过，证据位于 `docs/test-evidence/P0-T0/20260729T110955+0800/`。
- `P0-T2` 已完成：新增 schema v4、`pnpm roadmap:validate` 与 11 组 valid/fail-closed fixtures，机械验证多文件 authority、规范覆盖、双向映射、内部链接、依赖 DAG、decision 与状态一致性；证据位于 `docs/test-evidence/P0-T2/20260729T115639+0800/`。
- `P0-T3` 已完成：owner 接受 ADR 0004，锁定 Codex 实测 primary `2025-06-18`、compat `2025-03-26`/`2025-11-25`、SDK `1.30.0` 与 P0 no-Tasks 边界；严格协议 schema、RevisionContext、ConfirmationBinding、PRIV-MIN、VemError 和最小 EvidenceGraph 已通过完整门禁，证据位于 `docs/test-evidence/P0-T3/20260729T120836+0800/`。
- `P0-T4` 已完成：锁定 React/React DOM `19.2.8`、Vite `8.1.5` 和 plugin-react `6.0.4`，交付 9 类闭合 PRIV-MIN malicious fixture、SSR escaping smoke tests 与真实 production build；证据位于 `docs/test-evidence/P0-T4/20260729T132101+0800/`。
- `P0-T5` 已完成：接受 ADR 0005，交付始终 page-untrusted 的 injected selector、PRIV-MIN bounded projection、strict external-confirmation limitation 与 memory-only lifecycle；证据位于 `docs/test-evidence/P0-T5/20260729T134026+0800/`。
- `P0-T15` 已完成：接受 ADR 0006，交付固定 React/Vite/Oxc 矩阵的 serve-only source-anchor transform、bounded private in-memory registry 与 production non-participation 等价门禁；证据位于 `docs/test-evidence/P0-T15/20260729T141939+0800/`。
- `P0-T16` 已完成：交付 revision-scoped、memory-only、原子幂等的 source registry publication/current-only direct lookup；严格校验完整 ProjectRevisionContext、transform compatibility、规范相对路径、anchor identity hash 与 registry membership，旧 revision 仅保留一代诊断且不可升级为 current；证据位于 `docs/test-evidence/P0-T16/20260729T150232+0800/`。
- `P0-T17A` 已完成：交付版本化两层只读 pilot harness、独立 canonical evidence-bundle builder、闭合 Draft 2020-12 schema、全量输入/原始记录 hash、统一计时边界、ground-truth 隔离、later-holdout exclusion 与路径/文本去敏；证据位于 `docs/test-evidence/P0-T17/20260729T164018+0800/`。
- `P0-T17B` attempt 1 已完成并如实记录 `P0-VALUE=adjust`：预登记的 5-task/10-arm 运行得到 10/10 正确定位、5/5 VEM direct-primary match、0 wrong attribution/reselection/correction，但 VEM 仅 2/5 配对更快且中位定位时间约 39.21 秒，高于 direct 的约 30.37 秒，未满足事前成本门槛；canonical bundle 哈希为 `d7eaabf23afd3456c7adbd4cf9f1abd6c381c69149d7650b5ac9b361c642f65e`。
- `P0-T17C` 已完成 participant capsule/equal-base-context remediation：5 对 task capsule 的 base-context hash 相同，唯一允许差异是 VEM arm 的 `vem-context.json`；10 次真实 Bubblewrap filesystem probe 与 10 次 capsule 内 Codex binary probe 证明 repository/home/rules/skills/ground truth/holdout 不可见，capsule cleanup 零残留，证据位于 `docs/test-evidence/P0-T17C/20260729T173959+0800/`。
- `P0-T17D` immutable attempt 2 已完成并记录 `P0-VALUE=stop`：经 owner 明确授权的第二批 10 次外部 arm 全部退出 0、使用 10 个 fresh thread，得到 10/10 正确定位、5/5 VEM direct-primary match 与 0 wrong attribution；但 VEM 仅 2/5 配对更快，direct/VEM 中位时间分别约 41.99/44.21 秒，未满足三个预登记成本条件。预登记的 fail-closed capsule audit 另将 7/10 run 判为 `CAPSULE_COMMAND_PATH_ESCAPE`，因此 immutable verdict 为 `stop`；canonical bundle 哈希为 `80b08ac28f248addc1b1f1af13bc6f4678e5d63836e6a55ad8ca5cbd700c508d`。
- P0 phase 已按 decision model 设为 `failed`：attempt 2 的 `stop` 不可用后验解释覆盖，P0-T7 及其依赖链不再 eligible，当前 owner-approved P0 proof-of-value scope 到此停止。
- `P0-T17E` 已完成 terminal-stop 后允许的阻断点修复：bound legacy capsule/runner 哈希与全部 attempt 2 evidence 未变；独立 v2 auditor 区分 command paths、结构化 path-line output 与普通源码/JSON 数据，对 10/10 raw streams 通过，同时真实 capsule 外路径及 rule/skill marker 负例继续 fail closed。active replay 哈希为 `48f3c70db5c471e2b1b94d1c18730f0a60e51b730182ec5ade4b89a563b789d7`；本任务未重跑 pilot、未改变 `stop/failed`、未解锁 P0-T7/P1。
- `P0-T17F` 已完成剩余 timing 阻断点的只读取证：10 run/5 pair 的 monotonic duration 与 canonical verdict 精确一致；VEM/direct 分别执行 9/11 个 command、两边各有 1 个已恢复的非零 command，VEM 仍仅 2/5 pair 更快，第二 arm 仅 3/5 更快。raw event 无逐事件 timestamp，因此不能把总耗时归因给 shell、cache 或模型阶段；active report 哈希为 `664d8e49e0fdb573944aadc14b0affbcfae1fa0f3cc2db4c7104dc8f9eac5afc`，terminal state 不变。
- Owner 已授权绑定 frozen hash `57fb4b9b…f37359` 的 R0-T4 外部批次。冻结 runner 在首个 arm 尝试第二次登记 structured response，`TrustedReceiptLedger` 以 `RECEIPT_LEDGER_RESPONSE_DUPLICATE` fail closed；事前 `event-ledger-integrity-failed` stop 条件触发后，剩余 9 次调用未执行。R0-T4 attempt 1 已记录 `R0-RECOVERY=stop`，R0 phase 为 `failed`；失败发生在 sealed-write 前，因此没有完整 raw/ledger/correctness/cost metrics。P0-T17D `stop`、P0 `failed`、P0-T7/P1 锁定与零产品解锁边界不变。
- 独立 R1 runner remediation 已完成并记录 `R1-RECOVERY=stop`：冻结 batch 的首个 direct arm 成功；配对 VEM arm 退出 0，但产生错误的 `line:1/null` 与正确的 `line:7/direct anchor` 两个不同 schema-valid agent message。修复后的 recorder 在 stream close 后判定 `STRUCTURED_RESPONSE_CONFLICT`，完整封存 raw/terminal/ledger/failure/hash evidence 后停止剩余 8 次调用。R1 phase 为 `failed`；这证明 failure sealing 修复生效，但不提供完整成本或产品价值结论。`R0-RECOVERY=stop`、`P0-VALUE=stop`、P0/R0 failed 与零产品解锁边界均保持不变。
- `R2-T1` 已完成独立 final-output remediation charter：R2 对 R1/R0/P0 三条 terminal stop chain 均声明 non-supersession，phase/task dependency 为空且没有既有产品依赖边；proof hash 为 `46e7522676d366c5b93f2e32b6c682fabb76c5d3fa790a37a60eb6692171c25d`。R2 只授权本地 runner 修复和新预注册，外部调用仍未授权。
- `R2-T2` 已完成 final-output authority 修复：`--output-last-message` 的 runner-owned bounded file 是唯一 structured response，JSONL 只作审计；最后消息一致性、缺失/无效/不一致/超限/symlink 与 failure sealing 已覆盖。Bubblewrap 的 `/work` 仍只读，输出目录仅有一个 0600 file bind 可写；instrumentation hash 为 `235e7c8433787ef838c1f30d492e3ef24cb62ebd6ebf26bd43ca9cd559c0f8ab`，外部调用为 0。
- `R2-T3` 已完成新预注册：5 个 fresh recovery-only task、10 个 counterbalanced arm 和 8 个 runtime source binding 冻结于 hash `dddd48ade2a92b2e12ec7600c9cdc0bd65eee6d47023d01d70b8bd71b47c273a`，instrumentation hash 为 `09e237ddec722207ee3b2e22c714ca5631700ff7393877a66fdd75d04c46b8a0`；30 次本地隔离探针全部通过，`externalExecutionAuthorized=false`，R2-T4 等待单独授权。
- `R2-T4` 已完成并记录 `R2-RECOVERY=stop`：9 个 fresh process 均退出 0、权威 final file 与最后 JSONL agent message 一致、定位正确，且 0 protocol failure / 0 wrong attribution；第 9 个 run 的命令事件包含 frozen v2 auditor 禁止的 `AGENTS.md` marker，触发 `CAPSULE_AUDIT_V2_ESCAPE`，异常在 frozen runner 返回前未封存审计失败证据。批次按预登记规则停止，第 10 次未执行；无外部重试的 post-abort sealer 仅封存既有证据。R2 phase 为 `failed`，R1/R0/P0 stops 与零产品解锁边界不变。
- `R3-T1` 已完成独立 capsule-audit containment charter：R3 对 R2/R1/R0/P0 四条 terminal stop chain 均声明 non-supersession，phase/task dependency 为空且没有既有产品依赖边；proof hash 为 `5579dde55167cad9c1b024100b60e54f1d533868d4b1124a67fed233fb87b526`。Owner authorization 仅覆盖 audit semantics、异常封存、测试与新预注册，外部调用仍未授权。
- `R3-T2` 已完成审计语义与异常封存修复并通过冻结前复核：AGENTS、SKILL 及二者合并的严格 marker-only 负查找成为 non-authorizing warning，真实规则内容/路径、敏感/外部路径、遍历和 stderr evidence 继续 fail closed；permission profile 使生成命令无法读取 auth、无法写 `/work`、没有敏感环境变量或交互扩权，网络禁用记录为严格配置绑定而非未执行的 runtime observation。audit/evaluator/hash/aggregate 异常与 wrong attribution 均先封存并触发 batch stop；保留初始 proof 后新增 sibling proof `docs/test-evidence/R3-T2/20260730T004219+0800/`，hash 为 `fadca8e3f7660f144bd31ae8ab5e1155d9eb1f6ad3cc07634f2ea830306a8ec3`，外部调用为 0。
- `R3-T3` 已完成新预注册：5 个 fresh containment-only task、10 个 counterbalanced arm、equal-base capsule、10 项 transitive runtime source binding 与 current no-model permission preflight 冻结于 hash `8b886d443c576540f6b3b2d90e06abfd95d57955f696680dd998b748d4ffdd5b`，instrumentation hash 为 `1592699eea206c5d75327053c065a44a27153ff2d3e263692751e56917d6ca80`；30 次本地探针全部通过，`externalExecutionAuthorized=false`、product unlock count 为 0，R3-T4 等待绑定完整 hash 和 10 次 run 的单独 owner authorization。
- `R3-T4` 已完成并记录 `R3-RECOVERY=stop`：绑定目的地、模型、participant capsule 数据范围、完整 preregistration hash 与最多 10 次调用的 owner authorization 通过后，首个 direct arm 获得 fresh thread，但外部请求重连后超时，未产生 `turn.completed` 或权威 final response，进程退出 1。v3 audit、permission/auth boundary、evaluator、recorder/outer hash 与 failure sealing 均通过；`protocol-response-integrity-failed` 要求立即停止，剩余 9 次未执行。R3 phase 为 `failed`，R2/R1/R0/P0 stops 与零产品解锁边界不变。
- `R4-T1` 已完成独立 external-transport timeout remediation charter：R4 对 R3/R2/R1/R0/P0 五条 terminal stop chain 声明完整 non-supersession，phase/task dependency 为空且没有既有产品依赖边；owner authorization 只覆盖零模型 preflight、超时分类、有限 retry runner、测试与新预注册，外部调用仍未授权。
- `R4-T2` 已完成零模型 transport remediation：当前 Codex binary、capsule、permission profile 与 auth denial 的真实本地 probe 通过但不声称 provider reachability；只有 sealed timeout-before-response 可进入最多一次 retry，全批硬上限为 20 process attempts，每次 attempt 独立 hash-seal。R3 timeout 只读 replay 分类通过但未实际 retry，proof hash 为 `2d19fd9b848018f08d3dcbd937c17f6764036974666d626bb8827ddfcbe9a42f`，外部调用为 0。
- `R4-T3` 已完成新预注册：5 个 fresh transport-only task、10 个 paired arms、每 arm 1 次 retry、全批最多 20 process attempts 与 10 项 runtime source binding 冻结于 hash `0ddb8c6f51d140042167231a22f8b3f73735fc8d0e271e3da5f11590c9995104`；instrumentation/data-scope hashes 为 `78ec7bd51ffd3cbf7f36cddabdd16dcd73d5d88877700632350471d81865f064` / `2fe4246a5cdd3aee19efb1d2e2f56f2469ba82c8f5dc32f1651c68a86d0b8ca8`。30 个本地探针通过，`externalExecutionAuthorized=false`、product unlock count 为 0，R4-T4 等待单独知情授权。
- `R4-T4` 已获精确授权但执行受阻：冻结验证通过后仅启动 1 个 direct arm 进程；它耗尽 WebSocket 5 次 timeout reconnect、fallback HTTPS 后再耗尽 5 次 reconnect，却没有退出或产生 `turn.failed`/`turn.completed`/final response。冻结 runner 缺少 wall-clock/process-tree termination，无法封存 attempt，故不允许 retry；批次被终止且第二个进程未启动。partial evidence 与 interruption record 位于 `docs/test-evidence/R4-T4/20260730T144143-0800/`，incident hash 为 `95021eac99d93d49985ee46d003a4108ff7a524244d83e3521b8edff8ecffd70`。`R4-T4`/R4 为 `blocked`，`R4-RECOVERY` 仍为 `pending`。
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

## 当前决策状态

见 `docs/decisions/OPEN_DECISIONS.yaml`。迁移、exact toolchain、Apache-2.0 项目许可证、MCP primary/compat revision、独立 R0/R1/R2/R3/R4 scope 与 R4-T4 frozen batch authorization 均已决定；`P0-VALUE`、`R0-RECOVERY`、`R1-RECOVERY`、`R2-RECOVERY` 与 `R3-RECOVERY` 均保持各自不可覆盖的 terminal `stop`，`R4-RECOVERY` 因未封存的 transport hang 保持 pending。

## 状态与记录分工

- `ROADMAP.yaml`：唯一任务、阶段、decision 状态源。
- `docs/progress.md`：只保存 implementation task 的完成/阻塞证据。
- `docs/checkpoints/`：只保存 `in_progress` 任务的可续接位置，不表示完成。
- `docs/history/DESIGN_CHANGELOG.md`：保存设计 baseline 历史。
