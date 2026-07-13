# Implementation Progress

No implementation tasks have been completed yet.

Each entry must include task ID, date, changed files, commands, test evidence, limitations, and next eligible task.

## Design baseline revision 1.10 — 2026-07-13

本记录仍是开工前文档修订，不是实现或环境迁移完成记录；所有 roadmap task/phase 保持 `todo`。迁移门禁从不可能同时满足的“扁平化但 old/new HEAD 与 raw tracked manifest 相同且 target clean”改为三步：P0-T0A0 只读冻结 Git/device/inode identity、`sourceBaselineHead`、dirty/untracked 与 target readiness；P0-T0A1 仅在 owner 授权 layout commit 后按旧 prefix 归一化内容 hash 迁移，证明 commit parent、clean target、single-writer cutover 并保留只读 rollback；P0-T0A2 再固定 evidence schema 和 exact Node/pnpm。`/mnt/d/vem` 与 `/mnt/d/VEM` 明确按 inode 判定别名，迁移后 canonical root 按 Git top-level 发现。

decision gate 改用稳定 logical key + immutable attempt：旧 verdict/evidence 不可覆盖，adjust 必须增加 remediation 与新 attempt，stop 或放弃 adjust 使 owning phase failed。P0-T12 被拆成 initialization/capability、consumer/confirmation lifecycle、bounded tools/resources；P7 container 与 SSH、四种分发 surface、P8 Svelte 与 Astro 也分别成为独立 failure domain。新增 `CONTAINER-SEC-001`，requirements 规范词覆盖扩展到应当/不应/不可/只允许/仅允许/需要、fail-closed 和 MUST/SHALL，并登记 Security testing own-body。

路线图现为 134 个 task、24 个 contract；下一 eligible task 是唯一无依赖的 P0-T0A0。它只做迁移前只读 readiness，不会创建 `/home/qwzx/src/VEM` 或执行 layout commit。

## Design baseline revision 1.9 — 2026-07-13

本记录是迁移前文档一致性修订，不是实现任务完成记录；所有 roadmap task 仍为 `todo`。canonical execution root 改为 WSL ext4 的 `/home/qwzx/src/VEM`，项目内容直接位于该 Git root；当前 `/mnt/d/VEM` 仅作为 staging/rollback。P0-T0A 先冻结 HEAD、dirty/untracked inventory，并验证历史、tracked manifest/hash、ext4 与无额外 bundle nesting；owner 接受前不删除旧树。Node 主基线更新为 24.x LTS，pnpm exact version 由预检 ADR 决定；direct Edge binary smoke 与 workspace 建立后的 Playwright `msedge` channel 被拆为 P0-T0C/P0-T0G，避免互相冒充。

路线图现在有独立 decision 状态：evaluation task 可以 `status: done` 但 `decision: adjust|stop`；dependent task/phase 只有在显式 `requires_decisions` 为 `continue` 时才可执行。P0-T17B、P0-T9C、P1-T17、P2-T13D、P3-T19、P4-T6C 都使用这一模型。P0 micro-pilot 增加 fresh Codex context per arm、交叉平衡顺序、withheld ground truth 和 one-time/per-task cost 分离；它是个人项目的 engineering smoke，不是统计产品声明。

`TEST-GATE-001` 被明确为通用测试/追踪 contract，而非可执行的单一硬 gate；实现领域规范的任务已改绑 privacy、selection、evidence、revision、lifecycle、verification、fallback、browser 或 remote contract。新增 `REMOTE-SEC-001`，`DATA-LIFE-001` 前移到 P0，P0-T12 交付最小静态诚实 CapabilityReport。requirements heading 使用 exact own-body 规则，roadmap 与 requirements 反向 contract mapping 保持机器可核对一致。路线图从 123 个任务调整为 125 个任务（新增 P0-T0G 与 P2-T13D），contract 从 22 个调整为 23 个。下一 eligible task 仍为 P0-T0A；它首先执行迁移门禁，而不是产品代码。

## Design baseline revision 1.8 — 2026-07-13

本记录是开工前最后可执行性修订，不是实现任务完成记录。项目所有者已选定 Git 顶层 `/mnt/d/VEM` 为 canonical project root，但 DrvFS 代码仓必须通过额外 watcher/HMR/symlink/case/pnpm 门禁，private runtime 则固定放在 WSL ext4。设计文档增加安装 Node 22/Corepack/pnpm、更新 WSL/Edge 和恢复 Windows interop 的命令基线。

路线图从 109 个任务调整为 123 个任务，将过大的 P0 preflight/E2E、P1 upgrade-uninstall、P2 package-pair-upgrade-uninstall、P3 visual-proof/corpus 和 P4 matrix/journey/verdict 拆成独立失败域。新增 `docs/tasks/ATOMIC_TASK_PROMPTS.md`，每个新拆 task 均有背景、目标、本阶段做/不做、约束、成功/失败路径、文件、测试和验收 prompt。当前 123 个 task 与 22 个 contract 的双向映射一致，下一 eligible task 为 P0-T0A。

P0 micro-pilot 改为两层只读路径：P0-T17A 生成版本化 raw records 和 canonical JSON evidence bundle，P0-T17B/Codex 只消费 immutable bundle 并给出 continue/adjust/stop verdict。新增 `CONF-BIND-001`，统一 P0/P1/P2 的确认语义：绑定 immutable selection hash、source anchor/registry/candidate set、最小 action allowlist、TTL 和最多一次原子 reserve/consume；project/document/source/action 变化、并发重放、到期和 restart 均 fail closed。

单人一周承诺被诚实收窄为 P0 proof-of-value/go-no-go prototype，不承诺一周内完成 P1–P8 或 Visual V1。若第 1 天 preflight 仍未通过、第 3 天 selector→source bundle 仍不可重复，或 micro-pilot 出现 wrong attribution，本周进入 stop/adjust，不以削弱安全与测试换取假完工。项目许可证建议 Apache-2.0，但在所有者提交 GitHub `LICENSE`/版权/贡献政策前仍是 private/unlicensed。

## Design baseline revision 1.7 — 2026-07-12

本记录是开工前设计审查修订，不是实现任务完成记录；所有 roadmap task 仍为 `todo`，下一 eligible task 仍为 P0-T0。本基线把环境预检从 Edge/ACL/双进程检查扩展为 canonical Git worktree、版本化 evidence、固定 Node 22.x/pnpm、package registry/proxy/CA、execution/filesystem profile、文件监听/HMR、真实 `msedge` channel launch、Windows/WSL HTTP/WebSocket、loopback 非暴露、private runtime ACL、双进程 restart 和机器可分类失败。P0-T0 固定产出 preflight ADR、standalone probes 与结构化 evidence；只找到 Edge 可执行文件或只运行 Linux Chromium 不再算 Tier-1 通过。

为降低完成大量基础设施后才发现产品价值不足的风险，新增 P0-T17：在 selector、fixture、transform 和 source registry 可用后，先用 3–5 个预登记任务比较 Codex 直接搜索源码与 selection-summary/source-candidate 路径。错误 source attribution、无可观察改善或 setup cost 过高会暂停 P0-T7 及后续 topology/verification 投入；该 micro-pilot 不产生发布百分比声明，也不占用 P1/P3/P4 holdout。

路线图 schema 升至 3，109 个任务全部直接声明 `contracts`，并与 `docs/requirements.yaml` 的 reverse mapping 双向一致。原 `P0-T6` 拆为 P0-T15 transform ADR/实现与 P0-T16 source registry；P1-T16 与 P1-T18 分开安装配置和升级卸载；P2-T14 与 P2-T16 分开 bearer issuance/storage 和 rotation/expiry/revoke；P3-T17 与 P3-T19 分开 reliability suite 和独立 evidence verdict。依赖已改指向真正提供 seam 的子任务，旧 ID 不再被活动路线引用。

实现仍未开始；P0-T0 若发现当前目录不是 canonical Git worktree、工具链不满足、`/mnt/*` DrvFS profile 未通过 watcher/HMR、Edge 无法真实自动化或其他预检项失败，必须记录 evidence 并保持 dependent work blocked。

## Design baseline revision 1.6 — 2026-07-12

本记录是设计与路线修订，不是实现任务完成记录；所有 roadmap task 仍为 `todo`。为避免最后阶段才发现 Tier-1 环境不可用，新增 P0-T0/`EDGE-PREFLIGHT-001`，当前下一任务改为 P0-T0；只有 Edge Stable、Windows/WSL loopback、用户私有 runtime ACL、双真实进程和 gate evidence path 预检通过后，P0-T1 monorepo scaffold 才 eligible。

本基线把此前审查发现的实现阻断项变成规范 contract 和机器可追踪路线：`PRIV-MIN-001` 把表单/private DOM/URL/prompt-data 最小过滤前移到第一条 P0 summary；`SEL-PROV-001` 明确 injected selection 不能证明真实用户手势，claim 不等于授权，strict prepared edit 需要 prompt/外部确认绑定；`OBS-FRESH-001` 用 provider-scoped runtime/target/viewport epoch 修正只按 build revision 缓存导致的异步 DOM、scroll、resize、zoom 陈旧问题，verification 禁止从普通 cache hit 产生 passed；`MCP-COMPAT-001` 不再无条件写死单一 `2025-11-25` baseline，保留 no-task 核心路径并隔离旧 experimental Tasks 与后续 Tasks extension；`DATA-LIFE-001` 分开 crash-safe control journal、bounded audit metadata、memory-first capture 和 P6 durable artifact。

新增 `docs/requirements.yaml` 与 `REQ-TRACE-001`，把 normative section 映射到 contract、roadmap task 和 required test category；`LICENSE-POLICY-001` 要求 P0-T1 在 package metadata 前记录项目所有者的许可证决定，并追踪 dependency 与 vendored asset 来源。P0-T7/P0-T8、P2-T5、P3-T5/P3-T6 已拆成 topology/proxy/MCP、prepare/match/complete、pairing bootstrap/token/UI、ephemeral resource/binary lane/capture epoch/capture execution 等可独立验收任务；P0 transform task 立即承担最小 production leakage 测试。P1 新增独立 UX pilot task，所有 product stop/go evidence 必须在执行前登记 threshold、holdout、no-VEM baseline 和计时边界。各 phase gate 现在有明确命令占位，P2 同时要求 storage trusted-context access 和 Service Worker WebSocket/minimum-version lifecycle tests。

实现仍未开始；下一 eligible task 为 P0-T0。

以下旧 baseline 条目保留其当时的任务编号和“下一任务”记录用于审计；当前状态一律以上方 1.6 与 `ROADMAP.yaml` 为准。

## Design baseline revision 1.5 — 2026-07-12

本记录是设计与路线一致性修订，不是实现任务完成记录；所有 roadmap task 仍为 `todo`，下一实现任务仍是 P0-T1。

本基线根据跨文档审查与同类产品/平台资料复核，修正了会阻断实施或推迟产品验证的问题：新增 `TOP-P0-001`，锁定 MCP 所有的 coordinator、用户私有 runtime discovery、真实 Vite 进程同源代理和独立 build-integration channel，避免用测试进程内拼装掩盖 P0 传输缺口；新增 `VER-TXN-001`，以 prepare 时固定的 target scope 和 Vite/source-registry 模块交集识别相关 update batch，无关 HMR 不再满足等待；新增 `SEC-PAIR-001`，首次 bearer token 颁发前必须原子消费终端一次性 bootstrap code；新增 `CAP-RACE-001`，capture 使用可被激活、导航、document 和 mask 事件失效的 epoch，并诚实限定 DOM mask 只是纵深防御。

路线图同步把最小独立 binary lane/回压前移到首次截图之前，把 injected preview CLI、Codex 配置、可复现 Edge sideload 包、clean install/upgrade/uninstall 前移到 P1/P2，并把 fresh-profile/fresh-project 安装门禁纳入 P4 Visual V1；P3 在 V1 前交付最小 React list-key claim 和共享定义单项修改拒绝护栏，P5 保留完整 owner/usage/shared-impact。P2 收窄为 Tier-1 Windows/WSL 与本机 transport，container/SSH/remote 留到 P7；durable ArtifactStore、tombstone 和 orphan recovery 从 P3 后移到 P6 参考图首次需要持久化时交付。默认 PageContext 改为 origin + redacted path，产品指标增加安装、配对、source 确认、编辑保留和卸载残留，P1/P2 增加 stop/go pilot，P3 golden set 扩大且 P4 使用独立 holdout。

`AGENTS.md`、`PLANS.md`、`ROADMAP.yaml`、`prompts/NEXT_TASK_PROMPT.md` 与 `docs/DESIGN.md` 已同步这些 contract；P0-T2 负责实现 contract-ID、内部链接和 roadmap 一致性检查。实现仍从 P0-T1 开始。

## Design baseline revision 1.4 — 2026-07-12

本记录是设计一致性修订，不是实现任务完成记录；所有 roadmap task 仍为 `todo`，下一实现任务仍是 P0-T1。

基于实现可行性与同类产品资料复核，本基线修正了以下跨文档问题：验证改为编辑前 prepare/before Observation/revision barrier 与编辑后 journal replay/complete；所有跨层 revision 统一为 `ProjectRevisionContext`/`RevisionContext` 投影代数；MCP consumer 使用服务端派生身份和有 TTL 的 immutable selection claim；PairingProtocol 明确采用短期 scoped bearer capability 而非含糊暗示 proof-of-possession；Edge `captureVisibleTab` 增加每 window 串行、平台速率、截图前后 active tab/document 校验和 mask snapshot 竞态拒绝；默认截图改为短时内存资源，只有显式 pin 才允许较长保留；P3 被重排为先交付真实像素/style/geometry 垂直切片，再完成通用队列、耐久 artifact 和生命周期加固；P4 成为 Visual V1 高级证据与发布门禁；P0 source transform 增加明确 Vite/React/plugin/sourcemap/Fast Refresh 兼容矩阵；各阶段加入 golden-task 指标和 zero false-positive `passed` 门禁。

`AGENTS.md`、`PLANS.md`、`ROADMAP.yaml`、`prompts/NEXT_TASK_PROMPT.md` 与 `docs/DESIGN.md` 已同步上述不变量，避免实现任务继续引用 1.3 的旧单阶段验证、含糊 token 或 P4 首次截图路线。

## Design baseline revision 1.3 — 2026-07-12

本记录不是实现任务完成记录，不会把任何路线图任务改为 `done`。

架构审查与一致性复核后，设计包升级到 1.3。`docs/DESIGN.md` 现为唯一完整设计事实来源；根目录设计文件仅为兼容入口。本次基线包含：Edge 优先浏览器支持、Chromium 扩展共用、跨环境传输、分层信任与 token 所有权、基于证据的映射、有界按需上下文、控制面/数据面分离、ACK（Acknowledgement，确认应答）/回压/幂等、带 revision 失效的缓存、二进制 capture resource、TTL（Time To Live，生存时间）/quota/lease/删除规则、显式回退策略、HMR（Hot Module Replacement，热模块替换）浏览器确认、客观验证规范、主观 `needs-review` 和垂直切片路线图。

一致性复核明确了 P0 必须随 source resolution 交付最小 EvidenceGraph，P1 只负责加固该闭环；P0 的最小选择器、文本验证和 P1 的扩展任务不再被描述为两次首次实现。下一任务提示也为 P0-T2 之前尚无仓库验证器的阶段规定了可审计的 bootstrap 检查。

实现仍从 P0-T1 开始。
