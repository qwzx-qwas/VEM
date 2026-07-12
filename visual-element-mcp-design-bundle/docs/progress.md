# Implementation Progress

No implementation tasks have been completed yet.

Each entry must include task ID, date, changed files, commands, test evidence, limitations, and next eligible task.

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
