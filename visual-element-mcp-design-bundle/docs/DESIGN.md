# Visual Element MCP for Codex：产品、架构与实施设计

> 文档版本：1.10
> 日期：2026-07-13
> 工作名：Visual Element MCP（VEM，Visual Element Model Context Protocol，可视元素模型上下文协议工具）  
> 主要读者：项目作者、Codex、实现者与安全审查者  
> 文档性质：产品需求、技术设计、安全边界、数据生命周期、实施路线与验收标准的统一事实来源

---

## 0. 文档地位与阅读方式

本文件是项目唯一完整设计事实来源。根目录 `VISUAL_ELEMENT_MCP_DESIGN.md` 仅作为兼容入口，不保存第二份正文。

“唯一完整设计事实来源”表示本文件负责导航和汇总，不表示它覆盖已接受 ADR 或公开协议规范。发生冲突时采用以下优先级：

```text
安全不变量与已发布协议规范
  > accepted ADR
  > 本文的产品/架构概览
  > ROADMAP.yaml 的实施状态
  > PLANS.md 的单任务计划
```

本文中的长期目标、V1 承诺和后续候选必须分别标记；尚未通过原型或测试的内容不得描述为已验证能力。协议、安全、transport、数据生命周期和验证规则稳定后应拆入独立规范，本文保留摘要与链接，避免形成互相复制的第二份正文。

跨文档不变量使用稳定 contract ID。`docs/requirements.yaml` 是 contract 索引与需求追踪清单，记录每个 contract 的 authoritative section、首次交付阶段、roadmap task 和 required test category；它不复制规范正文。`AGENTS.md`、`PLANS.md`、`ROADMAP.yaml` 和 prompt 只引用 contract ID 与必要的执行摘要，不复制完整规范。

`REQ-TRACE-001` 要求：`docs/requirements.yaml` 登记的全部规范词（包括必须/不得/禁止/不能/应当/不应/不可/只允许/仅允许/需要、fail-closed 与 MUST/SHALL）按 heading own-body 规则检查；新增或移动规范条款时必须同步 contract section。每个 `ROADMAP.yaml` task 还必须直接声明适用的 `contracts`。`TEST-GATE-001` 只是通用的原子测试与追踪 contract，不是一个可单独执行的 shell gate；只有任务确实不实现任何领域规范行为时，才可只声明它，并在任务计划中解释原因。真正阻止后续执行的是未满足的 task/phase dependency、逻辑 decision gate、phase gate 命令或失败状态。`docs/requirements.yaml` 的 `roadmap_tasks` 与 task 的 `contracts` 必须双向一致，不能只维护一侧。P0 bootstrap check 先验证已登记 section、task、test category、双向 contract reference、decision attempt/reference 和 task coverage；P0-T2 起由仓库 validator 检查未知 contract ID、失效内部链接、孤立 roadmap task、依赖环、未被 contract section 覆盖的规范条款、没有直接 contract 绑定的 task、decision attempt 链错误，以及没有 roadmap/test 映射的 contract。CI 检查稳定 contract/section 和显式状态字段，而不是依赖自然语言逐句猜测条款身份。

开始实现前依次读取：

1. `AGENTS.md`：不可违反的长期规则；
2. `docs/DESIGN.md`：产品、架构、安全与接口设计；
3. `docs/requirements.yaml`：contract、权威 section、roadmap 与测试追踪；
4. `ROADMAP.yaml`：机器可读任务、依赖和状态；
5. `PLANS.md`：单个原子任务计划模板；
6. 当前 P0 proof-of-value scope 期间读取 `docs/ONE_WEEK_EXECUTION.md`；其步骤顺序是建议，不是日历承诺；
7. 若 task 在拆分文档中，读取 `docs/tasks/ATOMIC_TASK_PROMPTS.md` 的对应条目；
8. 最近的包级 `AGENTS.md`；
9. 使用 VEM 修改页面时，再读取 `.agents/skills/visual-ui-edit/SKILL.md`。

本文区分三类表述：

- **必须**：安全、协议或产品不变量；
- **应当**：默认实施选择，改变时需要 ADR（Architecture Decision Record，架构决策记录）；
- **可以**：兼容或后续能力。

---

## 1. 术语与缩写

以下缩写在正文首次出现时也尽量给出全称；本表是统一解释：

| 缩写 | 英文全称 | 中文含义 |
|---|---|---|
| VEM | Visual Element MCP | 可视元素 MCP 工具 |
| MCP | Model Context Protocol | 模型上下文协议 |
| UI | User Interface | 用户界面 |
| DOM | Document Object Model | 文档对象模型 |
| IDE | Integrated Development Environment | 集成开发环境 |
| API | Application Programming Interface | 应用程序编程接口 |
| AST | Abstract Syntax Tree | 抽象语法树 |
| JSX | JavaScript XML | JavaScript XML 语法扩展 |
| TSX | TypeScript XML | TypeScript XML 语法扩展 |
| CSS | Cascading Style Sheets | 层叠样式表 |
| HMR | Hot Module Replacement | 热模块替换 |
| HTTP | Hypertext Transfer Protocol | 超文本传输协议 |
| HTTPS | Hypertext Transfer Protocol Secure | 安全超文本传输协议 |
| WS | WebSocket | WebSocket 双向通信协议 |
| WSS | WebSocket Secure | 安全 WebSocket 协议 |
| STDIO | Standard Input/Output | 标准输入/输出 |
| IPC | Inter-Process Communication | 进程间通信 |
| UDS | Unix Domain Socket | Unix 域套接字 |
| CDP | Chrome DevTools Protocol | Chrome 开发者工具协议；Edge 使用兼容协议 |
| CSP | Content Security Policy | 内容安全策略 |
| JSON | JavaScript Object Notation | JavaScript 对象表示法 |
| URL | Uniform Resource Locator | 统一资源定位符 |
| CI | Continuous Integration | 持续集成 |
| E2E | End-to-End | 端到端 |
| MVP | Minimum Viable Product | 最小可行产品 |
| TTL | Time To Live | 生存时间 |
| LRU | Least Recently Used | 最近最少使用淘汰策略 |
| ACK | Acknowledgement | 确认应答 |
| ADR | Architecture Decision Record | 架构决策记录 |
| OAuth | Open Authorization | 开放授权协议 |
| SSRF | Server-Side Request Forgery | 服务端请求伪造 |
| MV3 | Manifest Version 3 | 扩展清单版本 3 |
| HTML | HyperText Markup Language | 超文本标记语言 |
| XML | Extensible Markup Language | 可扩展标记语言 |
| CSSOM | CSS Object Model | CSS 对象模型 |
| URI | Uniform Resource Identifier | 统一资源标识符 |
| ID | Identifier | 标识符 |
| DPR | Device Pixel Ratio | 设备像素比 |
| FPS | Frames Per Second | 每秒帧数 |
| DNS | Domain Name System | 域名系统 |
| SSH | Secure Shell | 安全外壳协议 |
| WSL | Windows Subsystem for Linux | 适用于 Linux 的 Windows 子系统 |
| OS | Operating System | 操作系统 |
| SSD | Solid-State Drive | 固态硬盘 |
| MIME | Multipurpose Internet Mail Extensions | 多用途互联网邮件扩展类型 |
| MAC | Message Authentication Code | 消息认证码 |
| KB | Kilobyte | 千字节 |
| MB | Megabyte | 兆字节 |
| SVG | Scalable Vector Graphics | 可缩放矢量图形 |
| AGPL | GNU Affero General Public License | GNU Affero 通用公共许可证 |
| MIT | Massachusetts Institute of Technology License | MIT 开源许可证 |
| V1 | Version 1 | 第一版 |

---

# 一、项目目标与产品边界

## 2.1 用户问题

用户看到的是浏览器中已经渲染的页面，Codex 通常首先看到的是源码。用户会说：

- “把这个按钮改大一点”；
- “这张卡片太挤了”；
- “把登录改为继续”；
- “让这里参考这张设计图”；
- “只改当前这一项，不影响其他列表项”。

Codex 面对的却可能是组件复用、循环渲染、条件渲染、CSS Modules、Tailwind、全局样式、父容器布局和运行时状态。项目的核心价值是把用户选择的浏览器对象连接到可验证的源码证据。

## 2.2 产品使命

VEM 是 Codex 的浏览器感知层：

```text
看见问题
  -> 在 Microsoft Edge 中选择页面对象
  -> 获取分层、带来源和可信度的运行时证据
  -> Codex 阅读并修改真实源码
  -> 运行代码测试
  -> 等待 HMR（Hot Module Replacement，热模块替换）与浏览器确认
  -> 按明确断言重新观察
  -> 展示差异、证据、影响范围与不确定性
```

## 2.3 职责边界

VEM 负责：

- 浏览器对象选择、DOM 观察和可视上下文；
- 编译期源码锚点、运行时证据和候选解析；
- 浏览器会话、诊断、截图、缓存和数据生命周期；
- HMR 状态、浏览器 ACK（Acknowledgement，确认应答）和修改后观察；
- MCP（Model Context Protocol，模型上下文协议）结构化工具和资源。

Codex 负责：

- 阅读代码库；
- 制订修改计划；
- 修改真实源码；
- 运行测试、类型检查和 lint；
- 审查 diff；
- 根据用户意图构造验证断言；
- 最终报告修改、测试和剩余不确定性。

VEM 不负责：

- 任意文件写入或 Shell 执行；
- 替代 Codex 的代码代理、沙箱或审批；
- 把临时 DOM 修改当作最终结果；
- 声称任意 DOM 都有唯一源码；
- 在没有明确证据时自动判定主观视觉要求已经完成。

## 2.4 成功标准

首个原型闭环必须在 Windows 上的 Microsoft Edge Stable 中完成：

1. 用户选择一个 React + Vite + TypeScript/TSX 开发页面中的原生 JSX 元素；
2. Codex 获得源码锚点、运行时摘要和可信度；
3. Codex 修改正确源码并运行目标测试；
4. Vite 发出 HMR，Edge 中目标文档确认应用新 revision；
5. VEM 按 `VerificationSpec` 重新观察并返回可解释结果；
6. 生产构建不包含 VEM 客户端、标记、映射或端点。

该闭环是 P0 walking skeleton 的原型门禁，不等于可供日常使用的 V1。对外文档不得把仅支持注入模式、原生 JSX 元素和文本验证的 P0 描述为完整视觉产品。

## 2.5 交付里程碑

| 里程碑 | 对应阶段 | 对外含义 | 不包含 |
|---|---|---|---|
| Walking skeleton | P0 | 证明选择、anchor、MCP、单 consumer claim、两阶段文本验证和生产无泄漏可以闭环 | 并发 consumer、日常可信扩展、截图、样式工作流 |
| Injected MVP | P1 | 注入路径可恢复、可访问、可处理 revision 迁移和并发消费者，并通过干净安装/卸载 | 受信任浏览器身份、截图 |
| Trusted preview | P2 | Edge MV3、分层信任、配对、Tier-1 Windows/WSL 本机路径和可复现 sideload 包可用 | 完整视觉 V1、container/SSH/远程/CDP |
| Visual beta | P3 | 首个真实像素、样式、几何验证垂直切片可用，并经过最小资源生命周期保护 | 高级 CSS provenance、多选、CDP |
| Visual V1 | P4 | Edge 本地开发/sideload 的日常视觉修改闭环、稳定化、最小列表实例证据和主观 review 达到能力发布门禁，并通过全新环境安装 | 商店分发、多选/参考图/远程/CDP |
| Advanced releases | P5–P8 | 共享影响、多选、参考图、CDP、远程和多框架逐步交付 | 未通过对应 gate 的后续能力 |

“V1”只指通过 P4 gate 的 Visual V1。协议中可以提前保留后续 seam，但 capability report 必须以实际阶段和 provider 为准，未实现能力不得因出现在本文中而被声明可用。

## 2.6 安装、升级与卸载是产品能力

P1 起必须提供版本化 CLI 和 Codex MCP 配置生成器；命令名称可以在 P0 ADR 中锁定，但行为必须包括 dry-run、列出将修改的文件、只改项目内允许文件、可重复执行、版本兼容检查和 clean uninstall。P2 提供可复现的 Edge sideload 包及 pairing/revoke 指引。P4 Visual V1 必须在全新项目与全新 Edge profile 中完成安装 → 首次配对 → 首次选择 → 一次视觉任务 → 撤销/卸载，并证明 production output、项目配置、runtime discovery、token 和 artifact 无非预期残留。P7 只负责把已经可安装的开发者分发提升为 public npm/store distribution，不得首次解决安装问题。

## 2.7 产品证据与 stop/go gate (`UX-GATE-001`)

路线图任务完成不自动授权继续建设下一阶段。`ROADMAP.yaml` 顶层 `decisions` 定义稳定的逻辑 decision key、所属 phase 与 `current_attempt`；task/phase 的 `requires_decisions` 只引用逻辑 key，不能引用一次性的 task ID。每次评估 task 都记录 `decision_key`、从 1 单调递增的 `decision_attempt`、`supersedes_attempt` 与 `decision: pending|continue|adjust|stop`。task 未 `done` 时必须保持 pending，`done` 时不得仍为 pending；一旦写入非 pending verdict，其 task、原始 evidence 与 hash 不可覆盖或改写。

`continue` 才满足相应逻辑 gate。`adjust` 表示本次评估已诚实完成，但 owning phase 尚未通过：路线图必须先加入明确 remediation task，再加入一个新的 decision attempt task；只有新 task 已存在且 supersedes 链、递增序号和依赖完整后，才更新 `current_attempt`。`stop` 使 owning phase 进入 `failed`，并阻止所有依赖该 phase 的后续工作；不得把 stop task 仅改回 todo 或覆盖 verdict 来继续。若 adjust 后不再安排 remediation/retry，owning phase 同样进入 failed。任何重试都保留之前的 attempt 历史。

例如 P0-T17B 可以合法地处于 `status: done, decision_key: P0-VALUE, decision: stop`：这表示评估执行成功，但 P0 产品路径失败，P0-T7 的 `requires_decisions: {P0-VALUE: continue}` 不满足。它不是“前面 done 所以后面一直执行”；task dependency 只说明评估动作完成，逻辑 decision gate 才说明结果是否授权继续。P1 gate 必须通过独立 pilot task，在至少 3 个未参与实现的代表性 React + Vite 项目上记录安装、首次选择、正确 source candidate、首次编辑保留/撤销和卸载结果，并使用相同任务、固定计时起止点和相同成功定义记录 no-VEM baseline；P2 gate 必须记录 fresh Edge profile 的配对成功、失败、恢复、撤销与卸载 verdict；P3/P4 必须报告独立 holdout，而不只报告用于调参的 fixture。

为避免完成完整 P0/P1 基础设施后才发现核心价值不足，P0 在 source anchor、最小 selector/summary 与 fixture 可用后、coordinator/HMR verification 大量建设前，必须执行一次 `P0 value micro-pilot`。该检查使用预先登记的 3–5 个窄任务，对比“Codex 直接搜索源码”和“selection summary + source candidate”两条路径，只测目标绑定完整性、source top-1/top-3、错误定位数和定位耗时。对个人项目，它是低成本 engineering smoke，不是统计试验：不得产生“更快/更准确”的产品百分比声明。若全部任务没有可观察改善、出现错误 source 自动归因，或每 task 的使用成本明显高于节省的定位时间，后续 topology/verification 投入必须暂停并先调整 selection-to-source 路径。micro-pilot 的任务、起止点、原始结果和继续/调整判据必须在运行前写入版本化 evidence plan；不得复用 P1/P3/P4 holdout 作为调参样本。

每个 pilot 开始前必须把 stop/go threshold 写入版本化的 evidence plan，至少包含 install-to-first-selection p50/p95、首次连接或 pairing 成功率、source top-1/top-3、错误 source/reattach/transaction attribution 数、首次 edit 保留/撤销/人工修正比例、clean-uninstall residue 和 false-positive `passed`。不得在看到结果后降低阈值、替换 holdout 或改变计时边界。3 个项目只用于早期可用性和失败模式发现；任何百分比产品声明必须使用更大的预注册样本或明确标注为 pilot observation。

若核心路径不能达到预注册阈值，不能相对“Codex 直接搜索源码”的基线改善定位时间或正确率，或安装/配对失败成为主要阻碍，应先修正产品路径、缩小后续范围或停止该阶段，不得仅凭内部 contract test 进入高级 transport、durable artifact、remote 或多框架建设。DOM 选择必须在用户可见界面中明确绑定到 selection snapshot/claim 或当前 prompt；模糊的全局 active-selection 不算可验证的用户任务绑定。

### 2.7.1 P0 value micro-pilot 两层只读 harness

P0 micro-pilot 不依赖尚未实现的 coordinator、MCP 或同源 proxy。它使用两层、版本化、只读的证据路径：

```text
VersionedReadOnlyPilotHarness
  读取预登记 task manifest、fixture checkout、SelectionSummary 和 source registry snapshot
  只执行解析、排序、计时与 hash，不修改 fixture/source/registry
        │
        ▼
CanonicalEvidenceBundleBuilder
  生成 canonical JSON、schema validation result 和人类可读摘要
        │
        ▼
P0-T17B / Codex
  只消费固定 bundle，不在评估时重新计算 candidate 或改写原始记录
```

第一层输入必须用 content hash 固定，至少包含 `pilotPlanVersion`、`harnessVersion`、`taskManifestHash`、`fixtureCommit`、`sourceRegistryRevision`、`selectionSnapshotHash`、trial arm、统一计时边界和 later-holdout exclusion list。第二层只能从第一层的 immutable records 生成；JSON 键顺序、时间单位、null 表达、path redaction 和 hash 算法必须在 schema 中固定。

最小 pilot 隔离规则是：两个 arm 分别使用全新的 Codex conversation/context，不把前一 arm 的答案、搜索路径或候选带入后一 arm；同一 task 的 arm 顺序随机或交叉平衡；ground truth 与 evaluator 记录在 trial 完成前不进入 Codex、搜索索引或 bundle 可见字段；两个 arm 使用同一 prompt、fixture commit、工具权限、计时边界和 cold/warm-cache policy。一次性安装/生成 registry 的 setup cost 与每 task 操作成本必须分开报告。3–5 个任务只用于暴露明显失败和决定是否值得继续，不能据此作显著性或普遍效果声明。

Canonical bundle 至少记录每个 task 的 direct-search 与 VEM-assisted 两个 arm、setup cost、locate duration、top-1/top-3 candidates、chosen candidate、ground-truth match、wrong-attribution、operator correction、raw-record hashes 和 continue/adjust/stop 判据。harness 不得执行源码写入、Shell 任务、网络搜索、候选人工调参或 holdout 替换。错误 source 自动归因、两个 arm 计时边界不同、输入 hash 变化或 later holdout 被消费时，verdict 必须 fail closed。

## 2.8 项目与依赖许可证 (`LICENSE-POLICY-001`)

P0-T1 在生成 package metadata 前必须记录项目自身许可证或明确的 private/unlicensed 状态、版权主体、贡献接收方式和发布边界；设计文档不能替项目所有者默认选择 MIT、Apache-2.0、AGPL 或商业许可。若许可证决定尚未获得项目所有者确认，允许完成不发布的 workspace scaffold，但 public package、复制第三方代码或分发 extension 的工作保持 blocked。

依赖策略至少定义 allowed、review-required 和 forbidden/relicense-needed 类别，扫描 production 与 development dependency、生成可复现的 `THIRD_PARTY_NOTICES.md`，并固定审查 release/tag/commit。AGPL 项目默认只允许作为行为/公开架构参考；任何代码复制、链接或衍生关系必须经过单独许可证决定和来源记录。license scanner 的通过不能替代对字体、图标、截图 fixture、生成代码和 vendored asset 的人工来源检查。

---

对本项目的默认建议是 Apache-2.0：它对开发工具、MCP package 和浏览器扩展的商业/企业采用友好，同时提供比 MIT 更明确的专利授权和 NOTICE 机制。这仅是实施建议，只有项目所有者在 GitHub/repository 中提交 `LICENSE`、版权主体和贡献政策后才成为项目事实。在此之前状态仍为 private/unlicensed。

## 2.9 P0 建议执行顺序与范围

单人使用 Codex 时，当前 owner-approved scope 是 **P0 proof-of-value / go-no-go prototype**，不是完整 Visual V1。`docs/ONE_WEEK_EXECUTION.md` 的历史文件名为兼容保留，其中 Day/Step 只表达依赖友好的建议顺序，不是硬日历、工时估算或“一周必须完成”的承诺。Codex 可以加快编码，但不能替代真实环境、Edge、隔离 pilot 和证据门禁。当前 scope 只包括：

1. 完成并保存 execution preflight verdict；
2. 建立最小 TypeScript workspace、React/Vite fixture 和 protocol schema；
3. 交付 intrinsic JSX dev anchor、bounded selection summary 与只读 pilot harness；
4. 执行 3–5 个预登记定位任务，给出 continue/adjust/stop verdict。

P0-T17B 是逻辑 decision `P0-VALUE` 的首个 attempt。只有当前 attempt 的 `decision: continue` 时，stretch 才能按 P0-T7 → P0-T11 → P0-T12A → P0-T12B → P0-T12C 的依赖顺序向 bounded MCP read-only source-resolution smoke 前进；未完成这五个任务不得声称 MCP smoke 可用。当前 scope 不承诺 HMR transaction verification、MV3 pairing、capture 或 Visual V1。

stop condition 由结果而不是日历触发：canonical WSL ext4 root 或 Tier-1 preflight 未通过；selector→source bundle 在有界排错后仍不可重复；micro-pilot 出现 wrong attribution；或者 `adjust/stop` verdict 未被新的、预登记的重试证据取代。进入 stop 后只修复阻断点和保存 evidence，不通过删测试、缩小安全边界或把未完成能力改名为 MVP 来制造完成。长期 P1–P8 保留为后续 backlog，不自动进入当前 scope。

# 二、浏览器策略：Edge 优先、Chromium 共用

## 3.1 支持优先级与执行预检 (`EDGE-PREFLIGHT-001`)

| 级别 | 浏览器/运行时 | 用途 |
|---|---|---|
| Tier 1 | Microsoft Edge Stable on Windows | 日常主路径与发布门禁 |
| Tier 2 | Playwright Chromium | 快速 CI（Continuous Integration，持续集成）和跨平台 E2E |
| Tier 3 | Google Chrome Stable | Chromium WebExtension 兼容回归 |
| Preview | Edge Beta/Dev | 发布前前瞻回归 |
| Later | Firefox/Safari | 后续独立适配评估 |

Edge 与 Chrome 共享 Chromium WebExtension 核心，但 Edge 是产品文档、手工验收和发布门禁中的第一浏览器。扩展代码使用 Chromium 通用 `chrome.*` API，并从同一源码生成 Edge 与 Chrome manifest。

在创建 monorepo 之前必须完成不实现产品功能的 P0 bootstrap preflight，并保存可复核证据。P0-T0A0 只读盘点且不得创建/修改目标；P0-T0A1 在 owner 明确授权 layout commit 后执行迁移和单写者切换；P0-T0A2 再固定 evidence schema 与 Node/pnpm bootstrap。P0-T0A2–P0-T0F 可以逐项创建独立于 workspace package manager 的最小 `scripts/preflight/` shell/PowerShell probe、preflight ADR 和 evidence schema，但不能创建产品 package 或伪造后续 `pnpm edge:preflight:verify` 已存在。T0F 通过只授权 P0-T1 workspace scaffold 与非产品 validator 工作；workspace 存在后，P0-T0G 再完成固定 Playwright 的正式 Edge channel gate，P0-T3/P0-T4 与产品实现不得越过它。两层预检合计至少证明：

- staging identity 以 Git top-level + filesystem device/inode 为准，不以路径字符串为准；当前 `/mnt/d/vem` 与 `/mnt/d/VEM` 在 DrvFS 上可能只是同一目录的大小写显示别名，必须先用 `git rev-parse --show-toplevel` 与 `stat` 证明，禁止把两者当作 source/target 两份副本。owner profile 的目标是 `/home/qwzx/src/VEM`，迁移后 canonical project root 由目标 worktree 的 Git top-level 发现；绝对路径不是 CI 的跨机器不变量；
- staging worktree 有明确 `sourceBaselineHead`、dirty patch/bundle hash、untracked manifest/hash 与旧 bundle prefix。P0-T0A1 必须保留 Git 历史和全部已盘点 payload，把项目内容直接放到新 Git root，并用“去除旧 `visual-element-mcp-design-bundle/` prefix 后的内容 hash”证明语义 parity；扁平化会改变 tracked path，因此不能同时要求 old/new tracked path manifest 相同；
- target layout commit 只能由 owner 明确授权创建；其 parent 必须等于 `sourceBaselineHead`，commit 内容必须同时包含已盘点 dirty/untracked payload 与 prefix-normalized layout，完成后 target worktree 必须 clean。若没有 commit 授权，P0-T0A1 保持 blocked，不得自动 commit、丢弃或藏匿用户变更；
- cutover 只有在 layout commit、clean target、parent/内容证据和 ext4 Git top-level 全部验证后才发生。cutover 后 target 是唯一写入者，旧 staging 只读保留为 rollback evidence，禁止两个 worktree并行写入；owner 接受迁移前不得自动删除旧树。未满足时 P0-T0A2 及以后任务不可执行；
- 选定 execution profile、进程 owner 和文件系统位置明确。P0 Tier-1 固定采用 `WSL Node/Vite/MCP + WSL ext4 project/runtime + Windows Edge Stable`。DrvFS 只作为迁移源和可选兼容 profile，不再是 P0 主开发路径，也不能作为私有 ACL 证据；
- Node 使用当前受支持的 24.x LTS 主基线；只有依赖兼容证据和 ADR 明确记录时才允许 22.x，且不得低于 22.12。pnpm 通过 Corepack 或等价可复现方式固定 exact version；Git、PowerShell/WSL interop、package registry、代理/CA、磁盘空间、路径长度、大小写和 symlink 行为可用；P0-T1 只能把 P0-T0A2 已证明的 exact 版本写入 workspace metadata，不能临时换用未预检工具链；
- P0-T0C 使用受限 direct `msedge` smoke 证明真实 Windows Edge Stable 二进制、interop 和 policy classification，但不声称 Playwright channel 已通过。P0-T1 建立 workspace 后，P0-T0G 固定 Playwright exact version，并以 `channel: msedge` 记录 Edge/Windows/Playwright channel、headed/headless 结果，区分缺少 Edge、企业策略和自动化 channel 失败；P0-T3/P0-T4 及产品实现以 P0-T0G 通过为前置；
- Windows 或 Windows+WSL 环境能启动两个真实 OS process；Edge 可访问 fixture Vite HTTP origin 与 WebSocket/HMR smoke；随机 loopback 不被错误暴露到非 loopback，端口关闭、进程重启和 project instance 更换可观察；
- 用户私有 runtime directory 的 owner/ACL 能由选定 Node/OS 方案创建、读取、拒绝其他主体并清理；project root、普通 discovery 和日志不保存 secret；
- package registry/代理失败、WSL 网络、文件监听、ACL、企业策略和 runner 缺失分别产生机器可分类的 fail-closed 结果。

P0-T0A0–P0-T0G 的规范产物固定为 `docs/adr/0001-edge-execution-preflight.md`、`docs/test-evidence/P0-T0/<run-id>/environment.json`、对应的人类可读摘要和 `scripts/preflight/` probes；JSON 至少记录命令、版本、execution profile、文件系统类型、runner owner、时间、结果和 artifact hash，不记录 token 或环境 secret。若发布 gate 依赖手工或 self-hosted Windows runner，runner owner、触发方式、证据保存位置和不可在普通 Linux CI 伪造 `passed` 的规则必须在 ADR 中锁定。P0-T0F 是 bootstrap aggregate verdict；任一 A0–E 子项失败时 P0-T1 保持 blocked。P0-T0G 是正式 Edge automation verdict；它失败时允许保留 workspace 和运行 validator，但所有依赖真实浏览器/产品实现的任务保持 blocked。

### 3.1.1 已选 canonical root、迁移门禁与环境安装基线

项目所有者选择的本机迁移目标是 `/home/qwzx/src/VEM`；它是 owner profile，不是所有机器硬编码的 canonical 字符串。当前 staging 显示路径为 `/mnt/d/vem`，而 `/mnt/d/VEM` 可能指向同一个 DrvFS inode；只有 Git top-level + device/inode 才定义身份。实际项目内容位于 staging Git root 的 `visual-element-mcp-design-bundle/` 子目录。P0-T0A0 先只读冻结 `sourceBaselineHead`、dirty bundle、untracked manifest、prefix-normalized content manifest、case collision、目标不存在/空闲、ext4 容量和权限；该 task 不创建目标、不改 source。

P0-T0A1 才把子目录内容提升为目标 Git root 内容，保留 `.git` 历史和全部已盘点变更，并在 owner 授权下创建单一 layout migration commit。其 parent 必须是 `sourceBaselineHead`，目标必须 clean，内容 parity 按去除旧 bundle prefix 后的相对路径与文件 hash 验证；不能使用 old/new `HEAD` 相等或 raw tracked-path manifest 相等作为通过条件。验证后切换为 target-only writer，staging 只读保留。P0-T0A2 再定义 evidence/toolchain schema。迁移后所有命令、证据与文档相对路径从 `git rev-parse --show-toplevel` 的结果解析。用户私有 runtime discovery、socket、token metadata 和需要 POSIX mode 的临时数据使用 WSL ext4 的 `${XDG_RUNTIME_DIR:-$HOME/.cache}/vem`。

以下是开工前的建议安装基线，实际 exact Node/pnpm/Playwright 版本仍由 preflight ADR 记录并在 workspace metadata 中固定。不得将下列安装命令的成功替代预检证据。

WSL/Ubuntu：

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git jq unzip build-essential

export NVM_VERSION=v0.40.3  # 执行前先在浏览器中核对官方 release/tag
curl -fsSLo /tmp/install-nvm.sh "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh"
less /tmp/install-nvm.sh
bash /tmp/install-nvm.sh
source "$HOME/.nvm/nvm.sh"

nvm install 24
nvm alias default 24
nvm use 24
corepack enable
export VEM_PNPM_VERSION='<P0-T0A2 owner-reviewed exact version>'
corepack prepare "pnpm@${VEM_PNPM_VERSION}" --activate

mkdir -p "$HOME/.cache/vem"
chmod 700 "$HOME/.cache/vem"
node --version
pnpm --version
git --version
stat -c '%a %U %G %n' "$HOME/.cache/vem"
```

Windows PowerShell（管理员终端只用于安装/更新）：

```powershell
wsl --update
wsl --shutdown
winget install --exact --id Microsoft.Edge
winget upgrade --exact --id Microsoft.Edge
```

重新进入 WSL 后先检查 interop：

```bash
powershell.exe -NoProfile -Command '$PSVersionTable.PSVersion.ToString()'
powershell.exe -NoProfile -Command '(Get-Item "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe").VersionInfo.ProductVersion'
```

若 PowerShell interop 失败，先在 Windows 终端执行 `wsl --update` 和 `wsl --shutdown`，重启 WSL 后重试；仍失败时将 preflight 标记为 blocked，不继续 scaffold。P0-T0C 只用受限 `msedge --headless --dump-dom` 或 ADR 等价 smoke 证明二进制真实可启动。P0-T1 创建 workspace 后由 P0-T0G 安装固定 Playwright 并使用 `channel: "msedge"` 完成正式启动门禁；两份证据不得互相冒充。

## 3.2 三种浏览器模式

### A. Vite 注入模式

用途：免浏览器扩展安装的 MVP 和兼容降级。该模式仍需要项目依赖、Vite plugin 或显式 client import，不得宣传为“零安装”。

能力：

- DOM 选择与 overlay；
- bounding box；
- 基础 computed style；
- source anchor；
- HMR 浏览器 ACK。

限制：

- 页面脚本与工具运行时共享不可信页面环境；
- 页面不能持有高权限 token；
- 浏览器连接本身不被认证为受信任浏览器身份，只能进入 `injected-page-untrusted` ingress；同源和 Vite 服务端代理用于路由与缩小暴露面，不把页面 claim 升级为事实；
- 注入页面无法向 coordinator 证明 click/keyboard selection 来自真实用户；`event.isTrusted`、nonce 或 overlay 状态在 main world 路径中最多是 page claim。CapabilityReport 必须返回 `selection-confirmation-integrity: page-untrusted`，claim 只锁定目标而不代表用户授权；自动源码修改前需要 Codex 在受信任会话中展示 snapshot/source summary 并取得外部用户确认；
- 不承诺最终像素截图；
- iframe、Shadow DOM 和浏览器级能力有限。

### B. Edge MV3 扩展模式

MV3（Manifest Version 3，扩展清单版本 3）是日常主路径：

```text
Edge Extension Service Worker
  -> Isolated Content Script
  -> Page Runtime Adapter（仅提供不可信 React/HMR 证据）
```

能力：

- 隔离选择器与 overlay；
- `activeTab` 临时权限；
- 当前可见标签页截图；
- tab/frame/document 身份；
- token 保存在受信任扩展上下文；
- 与 coordinator 的认证连接。

`activeTab` 只提供用户手势触发的当前标签页临时访问，不等于对任意 coordinator endpoint 的网络授权。扩展连接动态开发 origin 时必须采用以下一种显式方案：

- 用户确认当前项目 origin 后，按精确 scheme/host/port 申请 `optional_host_permissions`；或
- 连接安装时固定、受限的 loopback broker，由 broker 解析到已配对 coordinator。

禁止由页面 payload 直接指定 Service Worker 要连接的任意 URL。manifest、可选 host permission 和 extension CSP `connect-src` 必须共同通过契约测试。

首版 UI 使用页面 overlay、工具栏按钮和小型 popup。Edge Sidebar/Side Panel 可以后续增加，但不是核心依赖。

### C. Edge CDP/Playwright 模式

CDP（Chrome DevTools Protocol，Chrome 开发者工具协议）兼容模式用于：

- 全页截图和精确 clip；
- matched CSS rules；
- media query 与 viewport 控制；
- iframe、network、console 和高级诊断；
- 自动化 E2E 和视觉回归。

该模式应使用独立浏览器 profile，不默认连接包含个人标签页的主 profile。企业策略可能限制自动化，必须返回明确 capability/error。

## 3.3 单一扩展代码库

```text
packages/browser-extension/
├── src/
├── manifest.base.json
├── manifest.edge.json
├── manifest.chrome.json
└── build-manifests.ts
```

Edge Add-ons 与 Chrome Web Store 的扩展 ID 可以不同；若未来使用 Native Messaging（原生消息通信），允许来源必须分别登记。MVP 不依赖 Native Messaging，尤其避免 Windows Edge 直接启动 WSL 内进程的安装复杂度。

---

# 三、核心对象模型

## 4.1 像素不是源码对象

鼠标坐标只用于找到对象：

```text
屏幕坐标
  -> elementsFromPoint()/event target
  -> DOM 元素或元素组
  -> 运行时证据与源码候选
```

不得把半个按钮伪造成半段源码。自由区域选择只能吸附到元素或生成 group。

## 4.2 DOM 与源码不是双射

一个 JSX 节点可以因 `.map()` 生成多个 DOM 实例；一个 DOM 的外观也可能同时来自组件定义、调用位置、CSS、父布局、主题和浏览器默认样式。因此映射是证据图，不是唯一答案。

## 4.3 选择类型

```ts
type SelectionKind =
  | "dom-element"
  | "component"
  | "group"
  | "page-root"
  | "region";
```

- `dom-element`：一个真实 Element；
- `component`：逻辑组件，可能对应零个、一个或多个 DOM 根；
- `group`：多个显式目标或区域解析结果；
- `page-root`：当前页面、路由和多个源码锚点；
- `region`：后续矩形/套索输入，输出必须仍是元素集合。

## 4.4 身份必须拆分

```ts
interface SourceAnchorIdentity {
  sourceAnchorId: string;
  sourceRegistryRevision: string;
}

interface RuntimeNodeIdentity {
  browserProfileId: string;
  tabId?: number;
  frameId: number;
  documentId: string;
  runtimeNodeId: string;
}

interface ReattachFingerprint {
  sourceAnchorId?: string;
  sourceRegistryRevision?: string;
  anchorSignature?: string;
  reactKey?: string;
  role?: string;
  accessibleName?: string;
  stableAttributes: Record<string, string>;
  ancestorSourceAnchors: string[];
}
```

所有跨层对象统一携带 revision 上下文，禁止把不同 revision 字段当作同一种时钟：

```ts
interface ProjectRevisionContext {
  projectInstanceId: string;
  coordinatorSequence: number;
  buildRevision: string;
  sourceRegistryRevision: string;
}

interface RevisionContext extends ProjectRevisionContext {
  documentId: string;
  documentGeneration: string;
}
```

- `coordinatorSequence` 只在同一 `projectInstanceId` 内单调递增，可以用于 barrier 和 journal 游标；
- `buildRevision` 与 `sourceRegistryRevision` 是 opaque identity，只允许相等比较；
- `documentId` 标识当前文档，`documentGeneration` 把 full reload 前后的文档代次纳入验证因果关系；
- coordinator 重启必须生成新的 `projectInstanceId`，旧 sequence 不得与新实例排序；
- project-level UpdateTransaction 使用 `ProjectRevisionContext`；Snapshot、Observation、BrowserApplyReceipt、cache key 和 verification barrier 使用带文档身份的 `RevisionContext`。两者是同一 revision algebra 的明确投影，不能各自拼接含义相近但语义不同的字段。

- `runtimeNodeId` 只在当前 document 内唯一，可用 WeakMap 分配；
- `sourceAnchorId` 指向编译期 JSX/TSX 节点；
- `ReattachFingerprint` 用于 HMR 后重定位；
- 旧 source registry revision 的 `sourceAnchorId` 只能作为迁移输入，不能被假定在新 revision 中仍然存在；
- React key 是证据，不保证总能获得；
- 多个候选得分接近时返回 `ambiguous`，不能任取一个。

## 4.5 SourceResolution 是证据集合

```ts
interface SourceResolution {
  hostAnchor: SourceAnchor | null;
  ownerFrames: Evidence<OwnerFrame[]>;
  usageCandidates: SourceCandidate[];
  styleEvidence?: StyleEvidence[];
  layoutOwners?: SourceCandidate[];
  confidenceBand: "high" | "medium" | "low" | "unresolved";
  strategy: "injected" | "runtime" | "source-map" | "heuristic";
  evidence: string[];
  conflicts: string[];
  warnings: string[];
  sharedImpact: "single" | "multiple-visible" | "unknown";
}
```

固定小数 confidence 只能作为可选展示，不应替代 evidence。`usages: []` 不得被解释为“没有其他使用位置”；无法确定时必须返回 `unknown`。

# 四、总体架构与跨环境传输

## 5.1 长期架构

```text
Microsoft Edge / Chromium
│
├─ Page Runtime Adapter                         Zone: page-untrusted
│  └─ 不可信 React/HMR evidence
├─ Isolated Content Script                     Zone: extension-observer
│  └─ DOM observation / selector / overlay
└─ Extension Service Worker                    Zone: extension-privileged
   └─ token / tab APIs / screenshot / ingress
              │ authenticated browser channel
              ▼
Local or Remote Coordinator                    Zone: coordinator-authority
├─ Session Registry
├─ Source Mapping Registry
├─ Evidence Graph
├─ Context Policy
├─ HMR State Machine
├─ Bounded Event Queues
├─ Context Cache
├─ Capture/Artifact Store
├─ Diagnostics Ring
└─ Data Lifecycle Manager
              │ internal transport
              ▼
MCP Server
├─ structured tools
├─ resources
├─ cancellation/progress
└─ compatibility fallback
              │ MCP over STDIO by default
              ▼
Codex
├─ source read/edit
├─ tests/typecheck/lint
├─ VerificationSpec
└─ diff/review/report

Optional Edge CDP/Playwright Provider
  -> screenshot / CSS evidence / viewport / advanced diagnostics

Vite Dev Server Plugin                           Zone: local-build-integration
  -> source registry / affected module graph / same-origin browser proxy
  -> authenticated build-integration channel to Coordinator
```

## 5.2 三条连接必须分开建模

```text
Browser  ── BrowserTransport ──> Coordinator
Codex    ── MCP Transport ─────> MCP Server
MCP      ── CoordinatorTransport -> Coordinator
```

STDIO 只描述 Codex 与 MCP Server 的默认连接，不表示 MCP Server 与 coordinator 必须通过 STDIO 连接。

## 5.3 P0 reference topology and process ownership (`TOP-P0-001`)

P0 不允许用测试进程内拼装掩盖真实的 Vite 与 MCP 进程边界。Windows-first walking skeleton 固定采用以下参考拓扑：

```text
Codex
  -> MCP STDIO adapter（由 Codex 启动）
     -> in-process Coordinator（该 project instance 的唯一 authority）
        -> 随机 loopback endpoint

Vite dev-server process
  -> VEM plugin 读取用户私有 runtime discovery
  -> 以 build-integration capability 连接 Coordinator
  -> 在当前 Vite origin 暴露 /__vem/browser，并在服务端代理浏览器流量

Injected page client
  -> 同源 /__vem/browser
  -> 不持有 coordinator endpoint、token 或绝对路径
```

约束：

- Coordinator 由 MCP STDIO adapter 进程持有；一个 project root 同时只能有一个被选中的 `projectInstanceId`，多实例必须返回 `AMBIGUOUS_SESSION`，不能后启动者静默覆盖；
- Coordinator 只绑定随机 loopback 端口。project-root 内不写 secret；普通项目 discovery 只允许包含非敏感提示；
- endpoint、`projectInstanceId` 和短期 build-integration capability 保存到操作系统用户私有 runtime 目录，文件/ACL 仅当前用户可读。若平台无法证明私有权限则启动失败；
- Vite plugin 终止浏览器同源连接，并在服务端添加 build-integration capability；页面只能进入 `injected-page-untrusted` ingress。该 ingress 只接受 bounded selection/HMR claim，不允许 source registry 写入、文件、Shell、capture、任意 URL 或高权限 action；
- source registry 只能由经过 build-integration capability 认证的 Vite plugin channel 发布；页面自报的 source ID 仍只算 claim；
- MCP 先启动时写 discovery；Vite 先启动时进入明确的 `coordinator-offline` 状态并有界重试，不扫描端口或内网；
- MCP/Coordinator 重启生成新 `projectInstanceId` 和 capability；Vite 重连后旧 session、journal、selection 和 revision 全部 stale；
- P0-T9A 必须从两个真实 OS process 启动 fixture Vite 与 MCP STDIO adapter，不能只用同进程测试替代；
- P2 可以把这条最小 loopback seam 替换为 UDS/Named Pipe/固定 broker，但必须保持 project-instance、权限和 fail-closed 语义。

这是 P0 唯一受支持的部署组合。其他拓扑在 capability report 中返回 unavailable，不得从长期架构表推断为 P0 已实现。

## 5.4 CoordinatorTransport

```ts
type CoordinatorTransportConfig =
  | { kind: "in-process" }
  | { kind: "unix-socket"; path: string }
  | { kind: "named-pipe"; name: string }
  | { kind: "loopback-http"; endpoint: string; tokenRef: string }
  | { kind: "ssh-stdio"; host: string; command: string }
  | { kind: "remote-http"; endpoint: string; auth: RemoteAuth };
```

以下自动选择从 P2 transport adapters 可用后生效；P0 只允许 `TOP-P0-001` 的随机 loopback reference seam，不得因本表提前宣称 Named Pipe/UDS 已实现。自动选择只用于安全本机 IPC：

```text
同进程 -> in-process
同一 Windows 主机 -> Named Pipe（命名管道）
同一 Unix 主机 -> UDS（Unix Domain Socket，Unix 域套接字）
显式 SSH 配置 -> SSH 承载远端 STDIO
显式 remote mode -> HTTPS/WSS
其余 -> 失败，不扫描内网、不猜测地址
```

## 5.5 部署组合

下表是长期 provider 组合，不代表早期阶段均已实现；实际可用性以里程碑、ROADMAP gate 和 `CapabilityReport` 为准。P0 只有 5.3 reference topology，P2 只承诺 Tier-1 Windows/WSL 与本机 adapters，container/SSH/remote 到 P7。

| 场景 | Codex→MCP | MCP→Coordinator | Browser→Coordinator |
|---|---|---|---|
| 全部 Windows | STDIO | 同进程/Named Pipe | Vite 同源 WS |
| 全部 Linux/macOS | STDIO | 同进程/UDS | Vite 同源 WS |
| Vite/Codex 在 WSL，Edge 在 Windows | WSL STDIO | WSL UDS | 当前 Vite origin WS |
| Codex 在 Windows、项目在 WSL | Windows 或 WSL STDIO | 认证 loopback/显式代理 | 当前 Vite origin WS |
| 项目与 Codex 在远端、浏览器本地 | SSH 启动远端 STDIO | 远端 UDS | SSH tunnel 后的同源 WS |
| Codex 本地、Coordinator 远端 | SSH STDIO 或显式远程 MCP | SSH/HTTPS | SSH tunnel 或 WSS |
| Dev Container/Docker | 容器内 STDIO/宿主代理 | 容器 UDS | 映射后的 Vite origin |

浏览器连接应优先使用当前页面已经访问的 Vite origin 下 `/__vem/browser`，避免硬编码 `127.0.0.1:7331`，也更适合 Windows/WSL、容器和 SSH tunnel。

## 5.6 Runtime discovery

- MCP 启动必须知道 project root 或明确 project instance；
- `projectInstanceId` 每次 coordinator 启动重新生成；
- 普通项目 discovery 文件只保存版本和非敏感 instance hint；P0 endpoint 与 build-integration capability 只保存在用户私有 runtime discovery，且必须验证 owner/ACL；
- token 不写入普通项目文件、URL 或页面；
- 远程 endpoint 必须显式配置；
- Vite 重启后旧 session/selection 标记 stale；
- 多项目和多标签页不得共享模糊的“active session”。

---

# 五、分层信任、token 与输入校验

## 6.1 威胁模型

页面、第三方脚本、DOM、console 文本和 Page Runtime Adapter 都是不可信输入。Content Script（内容脚本）处在隔离世界，但它观察的 DOM 可被页面操纵，且其消息仍可能受攻击者影响。Service Worker（服务工作线程）代码属于受信任扩展上下文，但它收到的 page-derived payload 仍不可信。

威胁模型还必须显式区分恶意网页、被利用的 content script、恶意 MCP client、同一用户下的其他本机进程和远程网络攻击者。V1 不承诺抵抗已经取得当前用户账户或扩展代码执行权的攻击者，但首次配对仍必须防止普通网页和未持有一次性 bootstrap secret 的本机进程静默领取 token；这一残余信任假设必须显示在用户文档和安全 ADR 中。

系统目标不是让恶意页面“变可信”，而是：

- 限制恶意页面能够触发的权限；
- 让每条结论带 evidence origin；
- 用独立来源交叉验证；
- 不让页面数据直接触发文件、Shell、URL 或 CDP 任意调用；
- 在无法验证时返回 ambiguous/untrusted，而不是伪造确定性。

## 6.2 正确 token 架构

```text
Page Runtime Adapter
  不持有 token
  只提供 claimed React/HMR evidence
       │ postMessage（不可信）
       ▼
Isolated Content Script
  校验结构、请求关联和大小
  自行读取 DOM/box
       │ extension messaging
       ▼
Extension Service Worker
  持有短期 pairing token
  从 sender 推导 tab/frame/document
  再次校验 action、sequence、quota
       │ authenticated channel
       ▼
Coordinator
  验证 token、连接绑定、revision、source registry 和语义
```

V1 明确采用短期、窄作用域的 bearer capability token，不声称它具备 proof-of-possession。token 应保存在默认仅受信任扩展上下文可访问的 `chrome.storage.session`；页面、content script、URL query、`chrome.storage.sync` 和长期明文磁盘不得保存 token。Service Worker 可能休眠，不能只依赖全局变量。

`chrome.storage.session` 在浏览器重启、扩展更新/reload/禁用时会清空。因此 `chrome.storage.local` 只能保存非敏感的 installation ID、用户确认过的 pairing metadata 和配置；重启后必须用明确的恢复/重新认证流程获得新 token，不能声称恢复旧 token。若未来采用非 bearer 的 proof-of-possession，必须另立 ADR，定义密钥生成、不可导出存储、challenge 签名、channel binding 和恢复行为。

Service Worker 初始化时必须对 `chrome.storage.session` 和包含 project/origin metadata 的 `chrome.storage.local` 显式设置 `TRUSTED_CONTEXTS` access level（在最低支持版本具备该 API 时），并在每次启动/升级后验证；不得依赖浏览器默认值，也不得调用把 session token 暴露给 content script 的 access-level 扩大。版本不支持或策略阻止限制 access level 时，pairing capability fail closed。contract test 必须从 content script 证明 token、pairing binding 和 project metadata 不可读，而不是只在 Service Worker 单元测试中断言配置值。

## 6.3 PairingProtocol (`SEC-PAIR-001`)

配对必须由扩展 UI 中的明确用户手势发起。页面只能提供不可信的 discovery hint，不能批准 origin、project 或 endpoint。最小状态机为：

```text
unpaired
  -> discovering
  -> awaiting-user-confirmation
  -> challenge-pending
  -> paired
  -> rotating | suspended
  -> expired | revoked
```

配对记录至少绑定：

```ts
interface PairingBinding {
  pairingId: string;
  authMode: "scoped-bearer-v1";
  tokenFamilyId: string;
  extensionInstallationId: string;
  browserProfileId: string;
  projectInstanceId: string;
  normalizedOrigin: string;
  coordinatorInstanceId: string;
  issuedAt: string;
  expiresAt: string;
  grantedCapabilities: string[];
  bootstrapMethod: "terminal-code-v1";
}
```

流程要求：

1. Coordinator 在受信任本机终端生成至少 128 bit 随机、单次、短 TTL 的 bootstrap secret，并以复制粘贴、受信任本机 deep-link/QR transfer 或分组比对友好的编码显示；默认流程不得要求用户逐字符手输完整 128-bit secret。clipboard/QR/deep-link 只能进入 extension-owned UI，不能经过页面、URL query、project 文件、普通日志或 shell command history；
2. Service Worker 从 sender 推导当前 tab/document/origin，只向本机 discovery 或用户显式配置的远程 endpoint 查询候选；
3. popup 显示 project root 的非敏感名称、精确 origin、coordinator instance、请求能力、code 过期时间和 transfer method；用户确认后粘贴、扫描或比对终端 bootstrap code，完成后立即清空 UI/clipboard best-effort 提示且不回显完整 secret；
4. Coordinator 原子消费 bootstrap secret 后才发出与本次 pairing attempt 绑定的单次 challenge；扩展完成 challenge 才能换取短期 token。仅有用户手势或可重放 challenge 不能领取 token；
5. token 是短期 bearer capability，服务端把它限制到 pairing、connection epoch、project instance、origin 和 capability scope；泄漏者在有效窗口内仍可能使用它，因此不得以“已绑定”替代保密、短 TTL 和撤销；
6. coordinator 重启、跨 origin 导航、权限撤销、扩展更新或绝对过期触发 suspend/重新配对，而不是静默连接新实例；
7. rotate 只允许在已认证的当前 connection epoch 上使用旧 token，旧 token 具有很短的 overlap window；服务端记录 token family/current generation 和有界 revoked identifier，不能维护无界 replay deny-list；
8. 用户可以从 popup 撤销当前项目、当前 origin 或全部 pairing，并同步清除 pending metadata 与 artifact lease。

多个候选 coordinator、origin/Host 不匹配、challenge 重放或用户未确认时必须 fail closed。loopback HTTP/WS 仍要验证 `Host`、`Origin`、token 和 project binding，防止恶意网页借 localhost/DNS rebinding 调用 coordinator。

配对 contract test 必须分别覆盖：缺少/猜错/过期/并发消费 bootstrap code、恶意网页直接请求、未持 code 的本机 client、challenge 重放、bearer token 被复制后的风险窗口、scope 拒绝、connection epoch 变化、浏览器重启、扩展更新、旧 generation 重放、rotation overlap 结束和 metadata/token 分库存储。实现不得把“作用域 bearer”描述为“不可转移凭证”。

## 6.4 Page Runtime evidence 不能被认证成事实

Page Runtime Adapter 与页面脚本共享 main world。nonce、MessageChannel 或自定义 type 只能减少误收和重放，不能阻止恶意页面伪造。其字段应显式表达为 claim：

```ts
interface UntrustedRuntimeEvidence {
  claimedSourceNodeId?: string;
  claimedReactKey?: string;
  claimedOwnerFrames?: OwnerFrame[];
  claimedHmrRevision?: string;
}
```

给 source marker 加 MAC（Message Authentication Code，消息认证码）只能证明 marker 由构建过程生成，不能防止页面把合法 marker 复制到错误 DOM，因此不能作为唯一真实性证明。

## 6.5 每层校验职责

### Page Runtime → Content Script

- `event.source === window`；
- 只接收已知 message kind；
- `additionalProperties: false`；
- requestId 必须对应 content script 发起且未过期的请求；
- 限制字符串、数组、深度和 owner frame 数；
- runtime evidence 不覆盖 content script 自行观察的 tag、box、role、text；
- 禁止 token、路径、任意 URL、HTML、命令和文件字段。

### Content Script → Service Worker

Service Worker 验证：

- `sender.id === chrome.runtime.id`；
- sender tab/frame/document 存在且与当前 port 绑定；
- sender URL 属于已配对开发 origin；
- action 属于有限枚举；
- messageId/sequence/requestId 合法且未重放；
- payload 大小、频率和字段白名单；
- tab 导航后旧 document port 立即失效。

content script 自报的 tabId、projectId、sessionId 必须忽略或拒绝；这些身份从 `sender` 和受信任连接派生。

### Vite Build Integration → Coordinator

Coordinator 验证用户私有 runtime discovery 中的短期 build-integration capability、project root realpath、project instance、plugin/transform version 和 connection epoch。Vite channel 可以发布 source registry、module graph 和 server-side HMR observation，但不能调用 capture、代表 MCP consumer 建立 claim、写源码或执行 Shell。浏览器经 `/__vem/browser` 代理的消息必须进入独立 untrusted ingress；代理存在不代表页面继承 build-integration 权限。

### Service Worker → Coordinator

Coordinator 再次验证：

- 认证 token 与连接绑定；
- project/browser/document session；
- protocol version；
- revision freshness；
- source ID 是否存在服务端 registry；
- source anchor tag 与 DOM observation 是否冲突；
- screenshot MIME（Multipurpose Internet Mail Extensions，多用途互联网邮件扩展类型）、文件签名、尺寸和 quota；
- diagnostics、DOM 和文本限制。

project root、source path 和 project identity 不接受浏览器自报。

## 6.6 Evidence 模型 (`EVIDENCE-TRUST-001`)

```ts
interface Evidence<T> {
  value: T;
  provenance: Array<{
    observedBy:
      | "page-runtime"
      | "content-script"
      | "service-worker"
      | "coordinator"
      | "source-registry"
      | "codex";
    observedAt: string;
    documentId?: string;
    revision?: string;
  }>;
  integrity: "claimed" | "directly-observed" | "registry-matched";
  freshness: "current" | "stale" | "unknown";
  corroboration: string[];
  conflicts: string[];
  limitations: string[];
}
```

`integrity` 只说明当前 evidence value 如何获得，不能声称页面内容本身可信；`freshness`、来源和交叉印证是独立维度。registry 中存在某个 source ID，只能把“registry membership”边标记为 `registry-matched`，不能把“该 ID 与当前 DOM 绑定”从 page claim 洗成 registry fact。组合证据必须保留各条边的最低信任来源，候选级 confidence、conflicts 和 limitations 不能只被顶层 `confidenceBand` 覆盖。页面 claim source ID + content script 观察 tag + coordinator registry/revision 匹配 + Codex 源码文本一致，可以提高候选置信度，但仍不能提供密码学意义的 DOM↔source 唯一绑定。任何一层都不能因上一层“已校验”而跳过自己的身份和语义校验。

V1 的最小 EvidenceGraph 与 source resolution 同时交付，不得把核心 evidence algebra 推迟到 React owner/多选阶段。后续阶段可以增加更多 evidence source 和评分策略，但不能改变“冲突优先于 confidence”的语义。

---

# 六、选择器与运行时采集

## 7.0 Selection provenance 与用户任务绑定 (`SEL-PROV-001`)

```ts
interface SelectionProvenance {
  provider: "injected-page" | "extension-content-script" | "cdp";
  observedBy: "page-runtime" | "content-script" | "automation-provider";
  interactionKind: "click" | "keyboard" | "programmatic" | "unknown";
  confirmationIntegrity:
    | "page-untrusted"
    | "directly-observed-extension"
    | "automation-policy";
  requiresExternalConfirmation: boolean;
  boundPromptOrClaimId?: string;
}
```

- 注入模式中的交互、`event.isTrusted`、overlay 和 selection message 都只能形成 page-untrusted provenance；页面脚本可能伪造或替换选择，不能由 nonce、同源 proxy 或 source marker 提升为可信用户手势；
- Edge extension 的 isolated content script 可以直接观察事件和 DOM，但仍要把事件、sender tab/frame/document 与 popup/toolbar 发起的选择模式绑定，由 Service Worker 和 coordinator 再验证；
- programmatic/CDP selection 必须声明 automation policy 和发起者，不能冒充用户点击；
- immutable snapshot、selection claim 和用户授权是三个不同概念：snapshot 保存观察，claim 防止任务目标漂移，只有用户可见的 prompt/confirmation binding 才说明用户选择了该任务目标；
- `vem_claim_selection` 对 `page-untrusted` selection 默认返回 `requiresExternalConfirmation: true`。Codex 可以报告已在受信任对话中展示并确认目标，但该报告仍标记 `reportedBy: "codex"`，VEM 不把它升级为浏览器事实；
- strict policy 不允许在缺少所需 confirmation binding 时进入 prepared edit workflow；balanced/compatibility 也必须显示 limitation，不能静默继续。

### 7.0.1 ConfirmationBinding 协议与状态机 (`CONF-BIND-001`)

ConfirmationBinding 是“用户在受信任会话中确认了哪个不可变目标、哪个源码候选和哪些动作”的有界授权记录。它不是浏览器事实、不是 bearer token、不是 selection claim，也不保存 prompt 正文。P0/P1 的 confirmation integrity 为 `codex-reported-user-confirmation`；P2 可在扩展 UI 直接确认时增加 `extension-ui-confirmed`，但两者使用同一状态机和消费语义。

```ts
type ConfirmedAction = "prepare-source-edit";

interface ConfirmationBinding {
  confirmationId: string;
  protocolVersion: string;
  hashNamespace: "vem-confirmation-v1-sha256";
  projectInstanceId: string;
  mcpClientSessionId: string;       // coordinator 从 MCP transport 派生
  mcpConnectionEpoch: string;
  claimId: string;
  selectionId: string;
  selectionSnapshotHash: string;   // canonical immutable SelectionSnapshot hash
  documentId: string;
  documentGeneration: string;
  sourceBinding: {
    sourceAnchorId: string;
    sourceRegistryRevision: string;
    normalizedRelativeFileIdentity: string; // coordinator-issued opaque identity
    candidateSetHash: string;
    chosenCandidateRank: number;
  };
  allowedActions: ConfirmedAction[];
  allowedVerificationSpecHash?: string;
  promptBindingHash: string;        // 受信任会话中展示内容的结构化 hash，不含 prompt 原文
  integrity:
    | "codex-reported-user-confirmation"
    | "extension-ui-confirmed";
  reportedBy: "codex" | "extension-service-worker";
  issuedAt: string;
  expiresAt: string;
  maxConsumptions: 1;
  state: ConfirmationBindingState;
}

type ConfirmationBindingState =
  | "pending-display"
  | "confirmed"
  | "reserved"
  | "consumed"
  | "expired"
  | "invalidated"
  | "cancelled";
```

`selectionSnapshotHash` 必须覆盖 project/browser/document identity、target summaries、provenance 和 RevisionContext，使页面替换 active selection、DOM node 或 source claim 后无法沿用原确认。`sourceBinding` 同时锁定 source anchor、registry revision、coordinator 发放的 opaque relative-file identity 和候选集；该 identity 不接受浏览器自报也不向页面暴露路径。候选排名、anchor migration、registry revision 或文件归属变化后必须重新展示并确认。`allowedActions` 按最小授权列出；一次 prepare 只能消费一个 `prepare-source-edit`，不能用同一确认执行第二次编辑。verification complete 不是第二次 ConfirmationBinding 消费；它只能通过该 prepare 产生的 runId、claimId 和 verification spec hash 继承原有边界，不单独扩大编辑权限。

`confirmationId` 必须至少具有 128 bit 不可预测随机性。所有 `*Hash` 使用 `hashNamespace` 指定的 canonical JSON + SHA-256；`candidateSetHash` 覆盖有序 candidate identity、rank、confidence band、conflict 和主要 evidence identity，不覆盖已被隐私规则排除的原文。`promptBindingHash` 覆盖实际展示给用户的 target/source/action 结构化摘要，不是对整段 prompt 原文做存档。confirmation TTL 默认 5 分钟、硬上限 15 分钟，不使用 sliding renewal；到期后必须产生新 confirmationId 并重新展示摘要。MCP connection epoch 变化会使旧 binding invalidated，不允许仅凭同一 client session 恢复。

状态转换：

```text
pending-display
  -> confirmed       受信任 UI/对话展示绑定摘要并收到用户确认
  -> cancelled       用户拒绝或取消

confirmed
  -> reserved        prepare 原子校验后为一个 runId 预留
  -> expired         超过 expiresAt
  -> invalidated     snapshot/source/claim/project/document 或 allowed action 不再匹配
  -> cancelled       claim release 或用户撤销

reserved
  -> consumed        before Observation + barrier + runId 已原子提交
  -> confirmed       prepare 在产生任何外部效果前安全失败并释放预留
  -> invalidated     预留期发生 project/document/claim 失效；不得恢复

consumed | expired | invalidated | cancelled
  -> terminal        不得重放、续期或恢复为 confirmed
```

prepare 必须在 coordinator 内用单个原子事务完成：校验 MCP connection-derived consumer、claim、snapshot hash、source binding、allowed action、TTL 和消费次数 → 预留 confirmation → 取得 before Observation/barrier → 创建 runId → 标记 consumed。并发 prepare 只能有一个成功；超时、断线、process restart 或无法证明事务是否提交时 fail closed，返回查询 run/confirmation 状态的建议，不自动重试可能已消费的确认。

统一失败分支：

- snapshot/document 不匹配：`CONFIRMATION_TARGET_CHANGED`，必须重新选择和确认；
- source anchor/registry/candidate set 不匹配：`CONFIRMATION_SOURCE_CHANGED`，必须重新展示源码候选；
- action/spec 越权：`CONFIRMATION_ACTION_NOT_ALLOWED`，不自动扩大 scope；
- TTL 到期：`CONFIRMATION_EXPIRED`；
- 已预留/已消费/并发重放：`CONFIRMATION_ALREADY_USED`；
- claim release/consumer disconnect/project restart：`CONFIRMATION_INVALIDATED`；
- integrity 不满足 policy：`CONFIRMATION_INTEGRITY_INSUFFICIENT`。

错误响应只返回 opaque ID、当前 terminal/non-terminal state、retryability 和安全恢复动作，不回显 prompt、页面文本、绝对路径或候选源码内容。P0/P1/P2 不得改变 `confirmed -> reserved -> consumed` 的一次语义；后续阶段只能增加更高 integrity provider 或更窄 action，不能恢复消费记录。

## 7.1 选择算法

点击时使用 `elementsFromPoint(clientX, clientY)` 获得视觉元素栈，再过滤：

- VEM overlay；
- script/style/meta/link；
- 不可见或零面积节点；
- 工具内部节点；
- 被隐私策略排除的子树。

祖先切换只沿 `parentElement`，不能与视觉叠层混淆。

## 7.2 交互

- 单击：确认当前元素；
- Shift + 点击：后续多选阶段增加/移除；
- 面包屑：选择祖先；
- 可配置键盘快捷键：父/子候选、退出、页面根；
- body/html：默认转换为需要确认的 page-root；
- 退出选择模式时恢复焦点和页面事件状态。

快捷键必须可配置并避免与页面、浏览器和辅助技术冲突。overlay 使用隔离样式、`pointer-events` 策略，并显式测试 fullscreen、top-layer dialog、Portal、SVG、scroll、zoom 和 open Shadow DOM。跨 origin iframe 在 V1 中返回 capability limitation。

## 7.3 hover 路径

hover 只在浏览器本地处理：

- 每帧最多一次 `getBoundingClientRect()`；
- pointermove 合并，只保留最新值；
- 不跨进程发送 pointermove；
- 不读取完整 computed style；
- 不截图；
- 不持久化。

## 7.4 selection handle

Content Script 使用 WeakMap 保存当前 Element handle。Coordinator 默认只保存 summary。后续 detail request 再从 handle 采集；节点 detached 时返回 stale，并用 `ReattachFingerprint` 尝试重定位。

不得为了避免重复采集而默认保存完整原始 DOM。

## 7.5 Consumer identity 与 selection claim

browser session 说明选择来自哪个浏览器文档，MCP client session 说明哪个消费者正在执行任务；两者不能合并。Coordinator 从 MCP transport connection 派生 `mcpClientSessionId`，不接受工具参数自报该身份。

不可变 selection snapshot 可以被多个消费者只读查看，但自动编辑/验证工作流必须先取得短期 claim：

```ts
interface SelectionClaim {
  claimId: string;
  selectionId: string;
  mcpClientSessionId: string;
  claimedAt: string;
  expiresAt: string;
}
```

- claim 绑定 immutable snapshot，不随 `active-selection` 更新而换目标；
- P0 只实现单个 in-process MCP consumer 的最小 claim；P1 才宣称并发 consumer、冲突 UI、断线 grace 和完整 TTL 恢复行为；
- 同一 selection 可以按策略允许多个只读 claim，但同一验证意图默认只有一个写工作流 claim；
- claim 有 TTL、显式 release 和连接断开 grace，不能成为永久锁；
- claim 冲突返回候选消费者的非敏感状态，不泄露 prompt 或源码；
- `active-selection` 只用于发现，不作为运行中任务的目标指针；
- VerificationRun 必须记录 `claimId` 和服务端派生的 `mcpClientSessionId`。

# 七、按需上下文与任务意图

## 8.0 最小出站隐私底线 (`PRIV-MIN-001`)

隐私过滤不是 P3 detail-profile 的后期增强，而是 P0 第一条 SelectionSummary 出站前就存在的安全底线。P0 必须在 schema、selector projection、proxy ingress 和 MCP output 四个边界共同执行最小 allowlist：

- 永不序列化 password、任何 input/textarea/select 当前 value、cookie、token、Authorization、URL query/fragment、原始敏感 pathname/title、`data-vem-private` 或用户 private selector 子树；
- `textPreview`、accessible name、placeholder 和 diagnostics 都有独立字符上限、Unicode/control-character 处理和 redaction reason；敏感目标返回 `redacted`/`capability unavailable`，不能为了文本验证绕过；
- Page Runtime 原始 payload 先校验再投影，未知字段和嵌套对象不得进入日志、journal 或错误回显；
- 所有传给 Codex 的 DOM、页面文本和 diagnostics 在 structured content 与兼容 text output 中都标记为 untrusted data，不拼接成系统/开发者指令；
- malicious fixture 从 P0 覆盖 prompt injection 文本、secret pattern、超长 Unicode、private subtree、表单 value、URL path/query 和错误回显；
- P3-T3 只把这条安全底线推广到所有 ContextRequest profile、字段 projection 和审计，不得首次补上 P0/P1 已经出站的数据保护。

## 8.1 不推送全量上下文

采用两阶段 pull（拉取）模型。

### 第一阶段：SelectionSummary

```ts
interface SelectionSummary {
  protocolVersion: string;
  selectionId: string;
  kind: SelectionKind;
  sourceNodeId?: string;
  tagName: string;
  role?: string;
  textPreview?: string;
  box: Box;
  ancestorPreview: AncestorPreview[];
  provenance: SelectionProvenance;
  revision: RevisionContext;
  observedAt: string;
}
```

目标小于 8–16 KB，不含完整 outerHTML、全部样式、截图、完整组件树或全部 diagnostics。

### 第二阶段：ContextRequest

```ts
interface ContextRequest {
  selectionId: string;
  needs: ContextCapability[];
  profileHint?: "content" | "style" | "layout" | "behavior" | "reference" | "page";
  limits: {
    domDepth?: number;
    maxNodes?: number;
    maxTextChars?: number;
    styleProfile?: "content" | "visual" | "layout" | "behavior";
    screenshotMaxBytes?: number;
  };
}
```

浏览器只采集显式请求的字段。隐私过滤、长度上限和安全字段白名单始终执行，不能被任务分类关闭。

## 8.2 任务意图、上下文和验证分离

`ContextRequest.needs` 是 wire protocol 中唯一决定采集字段的输入。任务分类属于 Codex 工作流提示，不作为权限、安全边界或 coordinator 必须实现的核心协议。

```ts
interface TaskIntent {
  primary: TaskClass;
  secondary: TaskClass[];
}

type TaskClass =
  | "content"
  | "style"
  | "layout"
  | "behavior"
  | "reference"
  | "page";

interface ContextPlan {
  initialNeeds: ContextCapability[];
  optionalNext: ContextCapability[];
  budget: ContextBudget;
}

interface VerificationPlan {
  checks: VerificationCapability[];
}
```

`TaskIntent` 可以由 Codex skill 在本地使用，用于生成初始 ContextPlan；V1 不需要把它发送给 coordinator。若未来数据证明服务端 profile 能显著降低 payload，可以在 `ContextRequest` 增加可选 `profileHint`，但实际字段仍由 `needs` 和 `limits` 决定。证据不足时 Codex 可以增量请求下一类上下文。

示例：“把按钮改宽并把登录改成继续”：

```json
{
  "context": {
    "profileHint": "layout",
    "needs": [
      "source-resolution",
      "dom-text",
      "computed-style",
      "bounding-box",
      "parent-layout",
      "context-screenshot"
    ]
  },
  "verification": {
    "checks": ["text", "geometry", "parent-overflow", "visual-review"]
  }
}
```

## 8.3 Context profiles

- `content`：完整可见文本、accessible name、placeholder、i18n candidate；默认不截图；
- `style`：关键 computed style、变量和元素/上下文截图；
- `layout`：祖先布局链、兄弟 box、overflow、flex/grid、viewport；
- `behavior`：owner/usage evidence、props/event candidate、runtime/build diagnostics；
- `reference`：当前 capture、reference crop 和视觉审查；
- `page`：origin、redacted route/path、页面 graph、全页或分区 capture；必须先规划。原始 pathname/title 另需 `page-sensitive-detail` capability。

## 8.4 StyleEvidence 分层

不承诺完整且唯一的 CSS 源码来源，返回证据：

```ts
interface StyleEvidence {
  property: string;
  computedValue: string;
  candidates: StyleSourceCandidate[];
  cascadeExplanation?: string[];
  confidenceBand: "high" | "medium" | "low";
  limitations: string[];
}
```

- Level A 页面内：computed style、inline style、class、CSS variables、可访问 CSSOM（CSS Object Model，CSS 对象模型）、父布局；
- Level B 构建期：CSS Module、Tailwind utility、Vite module graph；
- Level C Edge CDP：matched rules、inheritance、media query、stylesheet location、pseudo state。

跨 origin stylesheet 或无 CDP 时必须返回 limitation。

---

# 八、数据管道：缓冲、缓存、回压和断线恢复

## 9.1 三个概念不能混淆

- Buffer（缓冲）：吸收生产者和消费者速度差；
- Cache（缓存）：避免重复计算或重复传输；
- Spool（断线暂存）：连接中断后恢复重要消息。

所有队列有上限和 backpressure（回压），禁止无界数组。

## 9.2 控制面与数据面

控制面体积小、高优先级：auth、session、capability、selection、HMR revision、browser ACK、request/cancel、resource reference。

数据面体积大、低频：DOM detail、computed styles、screenshots、source graph、diagnostics detail。二者使用独立优先级队列；截图不得堵塞 auth/HMR。

## 9.3 MessageEnvelope

```ts
interface MessageEnvelope<T> {
  protocolVersion: string;
  messageId: string;
  requestId?: string;
  sequence: number;
  kind: MessageKind;
  observedAt: string;
  payload: T;
}
```

传输按 at-least-once（至少一次）设计，使用 messageId 实现幂等效果。低信任层不得声明高信任 identity；身份由接收层从 sender/connection 派生。

## 9.4 消息策略

| 类型 | 策略 |
|---|---|
| hover/pointermove | 仅浏览器本地，最新值覆盖 |
| selection confirmed/removed | 至少一次，ACK + messageId 去重 |
| HMR revision | 按 revision 合并，失败状态不丢 |
| browser ACK | 高优先级、按 document/revision 去重 |
| build error | 有界 ring buffer，错误指纹去重 |
| console info/debug | 有界 ring buffer，可优先丢低级别 |
| screenshot | 二进制流、captureId、可取消重试 |
| token/auth | 独立控制通道，不进入普通数据队列 |

队列满时：hover 覆盖、低级日志淘汰、selection 返回 busy/施加回压、auth/control 异常则 fail closed。初始 quota 必须可配置并通过 benchmark 调整。

## 9.5 Screenshot binary path

Service Worker 直接调用 `captureVisibleTab`。该浏览器 API 返回 data URL，因此 provider 必须承认 API 边界存在一次 Base64 表示，并立即解码为 Blob/ArrayBuffer；禁止再把 Base64 包入 JSON、跨 content script 传递或持久化。解码、隐私遮罩和本地裁剪完成后，使用二进制 HTTP/WS 上传 coordinator。

若传输支持 `bufferedAmount`、stream high-water mark 或 drain，应暂停生产者直到低水位恢复。上传有 maxBytes、AbortSignal 和临时文件原子提交。

首次实现 capture 之前就必须存在最小独立 binary lane：它与 auth/HMR/control queue 分离，具有并发上限、high/low water mark、超时、取消和每 project byte quota。P3 后续可以把该 seam 泛化为统一 priority queue，但不得先完成真实截图闭环、再补防止截图阻塞控制面的机制。

## 9.6 缓存层与运行时观察新鲜度 (`OBS-FRESH-001`)

### Source cache

```text
key = fileHash + transformVersion + parserVersion
```

缓存 AST、source anchors、component boundaries 和 CSS Module mapping。

### Context cache

源码/build revision 只描述代码因果关系，不描述页面当前运行时状态。用户输入、异步数据、路由状态、scroll、resize、zoom、字体和纯 DOM mutation 都可能在 RevisionContext 不变时改变 text/style/layout。因此 detail observation 还携带：

```ts
interface RuntimeObservationContext {
  revision: RevisionContext;
  runtimeObservationEpoch: number;
  targetMutationEpoch: number;
  viewportEpoch: number;
  observedAt: string;
  integrity: "page-claimed" | "content-script-observed" | "automation-observed";
}
```

epoch 只在同一 document/provider connection 内比较；重连、document replacement 或 provider 变化会生成新的 observation namespace，不能跨 namespace 排序。Content Script 使用 MutationObserver、ResizeObserver、scroll/visualViewport/zoom/route signals 按所请求 projection 更新相关 epoch；注入模式只能提供 page-claimed epoch，因此 cache 命中必须短 TTL 并重新验证 target signature。

```text
key = selectionId
    + contentRevisionIdentityHash(
        projectInstanceId,
        buildRevision,
        sourceRegistryRevision,
        documentId,
        documentGeneration
      )
    + observationNamespace
    + projectionRelevantEpochs(
        runtimeObservationEpoch,
        targetMutationEpoch,
        viewportEpoch
      )
    + contextRequestHash
```

project instance、document/generation、build/source registry revision、projection-relevant runtime epoch、request limits 任一变化即失效。不同 needs 只包含会影响该 projection 的 epoch，避免无关 mutation 使全部 cache 失效。`coordinatorSequence` 只用于 journal barrier 和观察先后关系，不进入内容 cache identity，避免无关控制消息使缓存全部失效。

Verification prepare/complete、security/privacy decision 和任何可能产生 `passed` 的 assertion 必须执行 fresh observation 或经过 provider-observed epoch revalidation；普通 context cache、page-claimed epoch 和 stale hint 永远不能直接用于 `passed`。缓存结果必须返回 age、observation context、hit/revalidated 状态与 limitations。

### Capture reference cache

允许多个消费者复用同一 `captureId`；不得因 URL 或 selector 相同而假设像素未变化。

### Diagnostics ring

按时间、数量和字节数限制，不是永久 cache。

## 9.7 Service Worker state

MV3 Service Worker 可能休眠：

- token、sequence、pending request metadata 使用受限 `chrome.storage.session`；
- 用户非敏感配置使用 `chrome.storage.local`；
- 不使用 `chrome.storage.sync` 保存 token；
- 大截图不进入 extension storage；
- 重要消息在 coordinator ACK 前保留小型 pending metadata；
- Service Worker 重启后恢复连接并重新协商 capability。

P2 extension ADR 必须锁定最低 Edge/Chromium 版本。若 authenticated browser channel 使用 Service Worker WebSocket keepalive，最低版本必须覆盖该生命周期行为（Chromium 116+ 路径）并测试 30 秒 idle、worker termination、browser sleep、network change 和 reconnect；若要支持更早版本，必须实现并声明不同的 reconnect provider，不能假设长连接会保持 worker 存活。keepalive 只维持已认证连接，不延长 token absolute expiry，也不能掩盖 coordinator/project instance 变化。

---

# 九、截图、资源和数据生命周期

## 10.1 CaptureProvider (`CAP-RACE-001`)

```ts
interface CaptureProvider {
  capabilities(): CaptureCapabilities;
  capture(request: CaptureRequest, signal: AbortSignal): Promise<CaptureResult>;
}
```

实现：

- `EdgeExtensionCaptureProvider`：当前可见 tab，元素/上下文 crop；
- `EdgeCdpCaptureProvider`：全页、精确 clip、高级自动化；
- `PlaywrightCaptureProvider`：CI 和受管浏览器；
- Vite 注入模式默认 `unavailable`，不使用低保真 DOM raster 冒充真实截图。

`captureVisibleTab(windowId)` 不能接受 `tabId`，只会捕获调用瞬间该窗口的 active tab。因此扩展 capture 流程必须防止标签切换竞态：验证已配对开发 origin 和 capture consent → 查询期望 window/tab/document generation 并创建单调 `captureEpoch` → 注册/读取 `tabs.onActivated`、navigation、tab update 和 document-port generation invalidation latch → 计算带 revision 与时间戳的隐私遮罩 → 隐藏 overlay/显示扩展级采集状态 → 等待两个 animation frame → 再次检查 active tab/document/epoch → 截图 → 截图后再次检查 active tab/document/epoch → 期间任何激活、导航、document 或 mask-invalidating 事件（包括 A→B→A）都丢弃像素 → 记录实际 bitmap 尺寸、DPR（Device Pixel Ratio，设备像素比）、zoom、visual viewport、scroll → 应用遮罩并本地裁剪 → 恢复 overlay → 二进制上传。

每个 window 只能串行执行一个 capture；provider 的默认速率上限不得高于平台的每秒两次限制。截图处理在受信任 extension context 中完成；若使用 offscreen document、worker canvas 或其他处理面，必须把它列入 trust zone、CSP、权限和生命周期测试。

截图专属安全规则：

- 默认拒绝 `edge:`、`chrome:`、`file:`、扩展页、浏览器设置页和未配对 origin；
- 首次 capture 或 capability scope 扩大时必须由扩展 UI 获取独立用户同意；
- password、`data-vem-private`、用户 private selector 和跨 origin iframe 默认整块遮罩；canvas、video、CSS animation、浏览器合成层或其他无法由 DOM mutation 证明静止的动态区域默认遮罩或拒绝 capture；
- 元素 crop 也不能先把整个未遮罩 viewport 上传到 coordinator；遮罩和 crop 必须在扩展受信任上下文完成；
- `CaptureRecord` 记录 `captureReason`、consent provenance、原始 bounds、mask 摘要和实际 provider，不记录被遮罩内容；
- capture 需要显式速率限制，不能用于连续录屏；
- 裁剪坐标以实际 bitmap/visual viewport 比例校准，不只依赖 `DPR * zoom` 公式。

DOM mask 是 defense-in-depth，不得宣传为能够自动识别全部个人信息或证明任意恶意页面的像素安全。严格策略在 mask coverage、动态区域或 capture epoch 证据不足时拒绝；balanced 策略也必须取得 viewport capture 的独立用户同意并显示 limitation，不能仅靠“未检测到敏感 DOM”推断安全。

每次成功 capture 还要产生不含像素内容的 receipt：

```ts
interface CaptureReceipt {
  captureId: string;
  revision: RevisionContext;
  windowId: number;
  tabId: number;
  captureEpoch: number;
  activeTabCheckedBefore: boolean;
  activeTabCheckedAfter: boolean;
  invalidatingEventObserved: boolean;
  maskSnapshotObservedAt: string;
  maskPolicyVersion: string;
  cropTransformHash: string;
  capturedAt: string;
  providerRateLimit: { maxCalls: number; perMilliseconds: number };
}
```

跨 origin iframe、private selector、动态像素区域或 DOM 在 mask snapshot 后发生变化且无法证明遮罩仍覆盖时，必须拒绝或丢弃 capture，而不是仅返回 warning。前后 active-tab boolean 不是充分证据；`captureEpoch` 期间无 invalidating event 才允许继续处理。

## 10.2 MCP resource

轻量工具结果只返回：

```json
{
  "capture": {
    "uri": "vem://capture/cap_456",
    "mimeType": "image/png",
    "width": 480,
    "height": 240,
    "sizeBytes": 83042
  }
}
```

`vem://` 是 MCP 逻辑 resource URI，不是网页 URL 或操作系统路径。小图片且调用方明确请求时可以直接返回 MCP image content；客户端 resource 支持不足时提供 `vem_get_capture` 兼容工具。

## 10.3 存储等级与 CaptureStore (`DATA-LIFE-001`)

“durable artifact 到 P6 才交付”不表示此前没有任何持久状态。实现必须区分四个独立等级，CapabilityReport 不得把一个等级的能力外推到另一个：

| 等级 | 首次阶段 | 内容 | 重启语义 |
|---|---|---|---|
| ephemeral browser/session state | P0 | selection snapshot/handle、claim、confirmation、pending metadata；P2 再加入 token | document/browser/project 结束、process restart 或显式 clear 即失效 |
| crash-safe control journal | P1 | 非敏感 session/revision/message/verification 状态 | 有界恢复；不含 DOM、prompt、源码或像素 |
| bounded audit metadata | P3 | allowlist、pairing/capture/deletion 的非敏感事件摘要 | 明确 opt-out、TTL、owner、manual clear 和 crash semantics |
| durable artifact store | P6 | 用户显式 pin/reference 的二进制资源 | atomic upload、lease、tombstone、orphan recovery |

P3 的 diagnostics ring 默认仍为 memory-first；若启用 7 天 audit metadata，它必须使用独立的最小 durable metadata store，不能偷偷复用 screenshot store，也不能因此宣称 artifact pin 可用。

P3 只实现同一字段语义的 memory-first ephemeral record，进程退出即删除，不支持 pin 或 crash recovery。以下 durable `CaptureStore`、原子临时上传、tombstone 和 orphan recovery 在 P6 参考图/显式 pin 首次需要跨进程保留时交付；capability report 在此前必须返回 unavailable。

```ts
interface CaptureRecord {
  captureId: string;
  browserSessionId: string;
  revision: RevisionContext;
  selectionId?: string;
  createdAt: string;
  expiresAt: string;
  absoluteExpiresAt: string;
  mimeType: "image/png" | "image/jpeg";
  sizeBytes: number;
  captureReason: "element-context" | "verification" | "reference" | "page-review";
  consentId: string;
  provider: string;
  sourceBounds: Box;
  maskSummary: string[];
  storageRef: string;
}
```

storageRef 只在服务端内部可见。resource 读取必须校验 project/session ownership，不通过错误泄露其他 capture 是否存在。

## 10.4 默认保留策略

| 数据 | 默认保留 |
|---|---|
| hover/pointermove | 不持久化 |
| Page Runtime 原始消息 | 校验/投影后立即丢弃 |
| selection handle | document 生命周期 |
| selection summary | project session，最近 100 条 |
| DOM/style detail | 30 分钟或 revision/document 失效 |
| 未固定的元素/上下文截图 | 默认仅内存，idle TTL 10 分钟，absolute TTL 30 分钟，session 结束即删除 |
| 用户显式固定的截图（仅 P6+ durable capability） | idle TTL 30 分钟，absolute TTL 24 小时 |
| active verification 引用截图 | verification 后 10 分钟 grace |
| build/console error | 500 条或 30 分钟 |
| info/debug log | 200 条或 10 分钟 |
| pairing token | coordinator session 且有绝对过期 |
| allowlist audit metadata | 默认 7 天，可关闭；不得含 title、URL/path、DOM 文本、源码内容或 prompt |

TTL 与 quota 均可配置，但必须有硬上限。滑动 TTL 不能突破 absolute TTL。

## 10.5 删除、lease 和 quota

```ts
type DeletionReason =
  | "ttl-expired"
  | "quota-pressure"
  | "session-ended"
  | "document-replaced"
  | "project-stopped"
  | "user-requested"
  | "token-revoked"
  | "schema-migration"
  | "startup-orphan-cleanup";
```

active verification 使用 `ArtifactLease` 防止使用中的 resource 被清理。P3 memory-first 删除流程是检查 lease → 从内存索引移除 → 释放 bytes → 记录可选的非敏感 deletion event；不得声称 tombstone/orphan recovery。P6 durable 删除流程才是检查 lease → tombstone → 从索引移除 → 删除物理对象 → 记录不含敏感内容的 deletion event。

quota 清理顺序：过期对象 → 未引用旧截图 → 低级日志 → 旧 detail bundle → 未固定 selection。不得删除 active selection、active verification 或认证状态。

P6 durable upload 才允许写入 `.tmp` 并在完成后原子 rename；启动和周期 sweeper 清理 orphan、过期临时文件、失配 metadata。P3 memory-first upload 必须有 cancellation、byte quota 和立即释放，不落入承诺 crash recovery 的磁盘 store。用户从首次保留状态起就必须有“清除当前 session/项目/全部 VEM 数据”的显式操作，具体可清理等级由 CapabilityReport 列出。

对高敏感 capture 可以采用每 session 临时加密 key；删除 key 实现 crypto erasure（密码学擦除），不承诺在 SSD 上通过覆盖实现物理擦除。

# 十、Capability 与回退策略

## 11.1 回退类型

- Retry（重试）：同 provider 短暂失败，次数和总时间有限；
- Failover（替代）：换用能力相近 provider，必须确认是否同 browser session/document；
- Degradation（降级）：返回较低能力、较低可信度结果。

## 11.2 FallbackPolicy (`FALLBACK-POLICY-001`)

```ts
type FallbackPolicy = "strict" | "balanced" | "compatibility";
```

- `strict`：扩展或高可信 source anchor 不可用即失败；
- `balanced`：允许 Edge Extension 降级为 Vite 注入，但失去 screenshot/高可信浏览器身份时必须报告；
- `compatibility`：允许 DOM clue 和 heuristic candidate，所有结果带低可信 warning。

不得回退：认证失败→无认证、WSS→公网 WS、revision 不匹配→忽略、截图失败→旧截图冒充当前、权限不足→自动扩大 `<all_urls>`。

## 11.3 CapabilityReport

P0-T12A 必须返回一个最小、静态且诚实的报告：只列出 P0 已实现 provider，并把 extension、pairing、capture、durable artifact、remote/CDP 和动态 provider selection 标为 unavailable/limited。P3 可以把它扩展为动态 CapabilityRegistry，但不得回写成“P0 没有 capability report”。P0-T12B 只交付 consumer/claim/confirmation lifecycle，P0-T12C 才交付 bounded source-resolution MCP tools/resources；三者不可互相冒充完成。

```ts
interface CapabilityReport {
  capabilities: Record<string, {
    available: boolean;
    provider?: string;
    evidenceIntegrity?: "claimed" | "directly-observed" | "registry-matched";
    freshness?: "current" | "stale" | "unknown";
    limitations?: string[];
    reason?: string;
  }>;
}
```

工具结果必须记录实际使用 provider 和降级链。stale cache 只能作为提示，不能用于验证 passed。

---

# 十一、源码映射与构建集成

## 12.1 映射等级

- Level 0 DOM clue：tag、text、class、role、redacted route/origin、候选搜索；
- Level 1 编译期 host anchor：intrinsic JSX 注入 opaque ID；
- Level 2 runtime owner evidence：React owner/key/usage candidate；
- Level 3 style evidence：页面、构建和可选 CDP 来源。

## 12.2 sourceAnchorId

```text
sourceAnchorId = hash(
  normalizedRelativeFile,
  enclosingComponent,
  normalizedJsxAstPath,
  intrinsicTag,
  transformVersion
)
```

它只承诺在明确 source revision 范围内可比较。AST 大改、文件移动或 transform version 变化时可以改变。不能用它代替 runtime identity。

## 12.3 跨 revision anchor reconciliation

验证发生在源码修改之后，因此旧 selection 不能假定其 anchor 在新 revision 中保持不变。Source Mapping Registry 至少保留当前和前一可验证 revision，并为变化节点产生迁移候选：

```ts
interface AnchorMigration {
  from: SourceAnchorIdentity;
  toRevision: string;
  candidates: Array<{
    anchor: SourceAnchorIdentity;
    confidenceBand: "high" | "medium" | "low";
    evidence: string[];
    conflicts: string[];
  }>;
}
```

匹配证据可以包含规范化相对文件、enclosing component、intrinsic tag、静态属性、AST 邻域、祖先 anchor signature 和 source-map location。不得只按新旧行号或最近 DOM 节点匹配。候选接近时返回 `ambiguous`；找不到时返回 `stale/unresolved`，不能把旧 anchor 当作当前事实。

hash 必须包含算法 namespace，并定义 collision 检测与 transform-version compatibility。开发 marker 还要测试广义 `[data-*]` selector、DOM snapshot、MutationObserver、序列化和未来 SSR/hydration 的影响。

## 12.4 开发期注入

- Vite plugin 仅在 dev serve 激活；
- production build 根本不执行 marker transform，而不是构建后盲删所有 `data-vem-*`；
- 检测用户已有保留属性并报冲突；
- 明确 JSX spread 前后顺序；
- 只处理项目内 `.jsx/.tsx`，跳过 `node_modules`；
- 保留原始 line/column 和 source revision；
- `transformIndexHtml` 不可用时提供显式 client import fallback 和 capability probe。

P0 source-anchor ADR 必须锁定并测试一个窄而明确的构建链矩阵，而不是笼统声称支持所有 React + Vite：

- Vite major/minor range、Node range、React range、TypeScript parser version；
- 当前首选基线是 Vite 8 的 Rolldown/Oxc 构建链与 `@vitejs/plugin-react` v6 Oxc 路径；若 P0 ADR 因依赖兼容性选择 Vite 7，必须固定版本、说明原因并保留升级 fixture，不能把 Vite 7 的 hook/parser 假设外推到 Vite 8；
- `@vitejs/plugin-react` 或选定 React plugin 的 exact 版本与 Oxc/Babel/SWC 路径；
- VEM transform 的 `enforce`、插件顺序、输入语法阶段和输出 sourcemap chain 责任；
- JSX automatic/classic runtime 和 Fast Refresh boundary；
- 在 VEM 前已被转换成普通 JavaScript、用户插件返回无 sourcemap、parser 不支持语法时的明确 degradation；
- transform 不破坏 HMR、source location、用户 data attribute、snapshot 和 production build 的 fixture。

矩阵之外的组合返回 capability limitation；只有在兼容 fixture 和 Edge E2E 通过后才扩大支持范围。

## 12.5 自定义组件限制

`<Button>` 最终 host DOM 可能来自 `Button.tsx`，而当前调用位置位于 `LoginPage.tsx`。V1 必须：

- 返回准确 host definition；
- 在 P3 前交付最近可获得 React list key 的有界 runtime claim，用它区分运行时实例，但不能把 key 当作源码身份；key 不可得时明确返回 limitation；
- 将可获得但尚未进入 P5 完整 owner adapter 的其他 runtime owner claim 标为 claimed/limited；
- usage candidate 无法可靠取得时返回空候选加 `unknown`，而非假装唯一 usage；
- 共享影响在 P5 前默认返回 `unknown`，不能从单个可见实例推断 single；
- 修改共享定义前让 Codex 明确影响范围；若用户要求“只改当前一项”而系统只能定位共享定义，自动工作流必须拒绝通过并返回 `ambiguous/needs-review`。

P5 才交付完整 bounded React owner、usage candidate 搜索和可解释 shared-impact 分析；因此 Visual V1 的公开支持矩阵仍必须把“自定义组件调用位置/共享影响精确解析”列为 limitation，但不得把最小 list-instance key evidence 和共享定义拒绝护栏一起推迟到 P5。

禁止为了传 marker 向所有自定义组件任意注入 props。

## 12.6 HMR revision

HMR 的有序游标是 `ProjectRevisionContext.coordinatorSequence`，只在一个 project instance 内单调递增，不等于文件行号或 Vite timestamp；build/source registry revision 仍是 opaque identity。每个 browser document 以完整 `RevisionContext` 记录最后 applied revision。CSS-only update、full reload、compile error 和 React commit 必须有可区分状态。

---

# 十二、协议与数据模型

## 13.1 Protocol package 与 MCP 兼容基线 (`MCP-COMPAT-001`)

`@vem/protocol` 包含：

- TypeScript strict types；
- JSON Schema；
- `additionalProperties: false` 的外部消息；
- protocol version 与兼容矩阵；
- error code；
- message size/array/depth limit；
- tool input/output schema；
- capability negotiation。

设计不再把 MCP protocol revision `2025-11-25` 无条件写死为唯一 V1 baseline。P0-T3 必须根据实际 Codex client 初始化结果、选用 SDK version range 和受测 client capability matrix，记录一个 primary revision 与受支持兼容 revision；运行时只使用 initialization 协商得到的明确 revision，不使用“latest”。若目标 Codex client 当前只支持 `2025-11-25`，可以把它作为 primary，但 ADR 必须记录原因、复核日期、升级触发条件和不实现已废弃实验能力的边界。

`vem_wait_for_update` 的核心闭环始终可以使用普通 bounded tool call、MCP cancellation 和 VEM journal replay，不依赖 MCP Tasks。`2025-11-25` 的 experimental Tasks 与后续 `io.modelcontextprotocol/tasks` extension 不是同一 wire contract：

- server 未协商 task capability/extension 时不得返回 task handle；
- P1 只在受测 Codex client 明确支持时通过 adapter 暴露 task execution，并按 negotiated revision/extension 分派；
- 旧 `tasks/list`/`tasks/result`/`task` request parameter 不能在新 extension 模式下复用；
- no-task client 是一级兼容路径，必须通过 wait timeout、cancel 和 early-journal-replay tests；
- protocol/SDK 升级必须先通过双端初始化、tool/resource/error、cancellation 和 task/no-task contract matrix，不能只靠 TypeScript 编译通过。

公开协议变化需要 ADR 和 contract test。

## 13.2 SelectionSnapshot

```ts
interface SelectionSnapshot {
  protocolVersion: string;
  selectionId: string;
  browserSessionId: string;
  kind: SelectionKind;
  createdAt: string;
  page: PageContext;
  targets: SelectionTargetSummary[];
  provenance: SelectionProvenance;
  revision: RevisionContext;
}
```

Snapshot 不可变。后续观察创建新的 Observation，不原地覆盖选择时证据。

## 13.3 PageContext

```ts
interface PageContext {
  origin: string;
  redactedPath: string;
  routeCandidate?: string;
  sensitiveDetailAvailable?: boolean;
  viewport: { width: number; height: number; devicePixelRatio: number };
  visualViewport?: { width: number; height: number; scale: number };
  browserZoom?: number;
  scroll: { x: number; y: number };
}
```

默认 PageContext 不返回 query、fragment、原始 pathname 或 title，因为敏感标识也可能出现在 `/users/<email>/orders/<id>` 这样的 path segment 中。通用 React + Vite 只能保证 origin 和按策略遮罩后的 path；router adapter 可以提供 `/users/:userId/orders/:orderId` 形式的 route candidate。原始 pathname/title 只能通过显式 `page-sensitive-detail` capability 请求，经过长度、segment allowlist/redaction 和审计后返回，并且不得进入默认日志或 allowlist audit metadata。

## 13.4 两阶段 VerificationRun，不持久化完整 EditRun (`VER-TXN-001`)

VEM 无法自行知道 Codex 的 planned files、changed files 和测试，也不能在编辑后才猜测哪次 HMR 属于本次修改。验证必须在源码编辑前 prepare，在编辑/测试后 complete：

```ts
interface VerificationBarrier {
  revision: RevisionContext;
  journalCursor: string;
  preparedAt: string;
  expiresAt: string;
}

interface VerificationTargetScope {
  sourceAnchors: SourceAnchorIdentity[];
  moduleIds: string[];
  dependencyClosureRevision: string;
  allowedSharedStyleModules?: string[];
}

interface VerificationRun {
  runId: string;
  claimId: string;
  mcpClientSessionId: string;
  selectionIds: string[];
  before: Observation;
  barrier: VerificationBarrier;
  targetScope: VerificationTargetScope;
  spec: VerificationSpec;
  hmr?: HmrResult;
  after?: Observation;
  assertions: AssertionResult[];
  status:
    | "prepared"
    | "waiting"
    | "passed"
    | "failed"
    | "ambiguous"
    | "needs-review"
    | "expired"
    | "cancelled";
}
```

prepare 必须原子地取得 before Observation、当前 RevisionContext、journal cursor 和由 source registry/Vite module graph 观察得到的 `VerificationTargetScope`。complete 从该 cursor 之后查找 transaction；即使 HMR 在工具调用前已完成也能回放。若 barrier 后存在多个不能唯一归因的相关 transaction、project instance 已变化、claim 失效或 before/after 目标无法可靠关联，结果必须是 `ambiguous`/`expired`，不能选择任意较新 revision。

before/after Observation 各自携带 `RuntimeObservationContext`，并按 `OBS-FRESH-001` 直接观察或 provider-revalidate；barrier 的 RevisionContext 负责代码/HMR 因果，runtime epoch 负责页面状态新鲜度，两者不能互相替代。普通 context cache 可以帮助定位采集字段，但不能作为 before/after observation 本体。

Codex 可以在 prepare 时声明 planned edit scope，并在 complete 时附带 `reportedChangedFiles`、文件 hash 或测试摘要，但这些字段标记 `reportedBy: "codex"`，只用于缩小/解释候选，不能单独把无关 transaction 升级为相关事实。Codex 在最终报告中说明 changed files/tests。后续若需要历史面板，可增加 `vem_record_run_event`，但它只能写 VEM metadata，不能写源码或执行 Shell。

Coordinator 从 P0 walking skeleton 起保留有界的最小内存 control-state journal，使同一 coordinator 生命周期内晚到的 wait 可以从 prepare cursor 回放；P0 不声称 crash recovery。P1 将其升级为有界、可恢复、crash-safe 的 journal，记录 session/document/revision、pending message ID 和 verification 状态迁移；Pairing 与 deletion event 随对应能力首次出现时加入。journal 默认不记录 DOM 正文、截图内容、源码内容或 prompt，并具有 TTL、字节 quota、schema version 和原子提交；它不等同于持久化完整 EditRun。

---

# 十三、MCP 工具与资源

## 14.1 原则

- 返回符合 output schema 的 `structuredContent`，并为兼容客户端同时返回简短 text summary/序列化内容；
- summary/detail 分级；
- 大对象使用 resource URI；
- tool 描述明确何时调用和何时不要调用；
- 所有 read/verify 工具受 project/session/capability 限制；
- 不复制 Codex 文件、Shell 和任意网络工具；
- 支持 MCP cancellation，长等待可取消；
- 客户端 capability matrix 明确支持时，长等待工具可以声明 MCP task support；不支持时继续使用有界 timeout、cancellation 和 journal replay，不得要求 task capability 才能完成核心闭环；
- 客户端不支持 resource 时提供兼容工具。

## 14.2 V1 工具

- `vem_get_capabilities`：provider、模式、限制、fallback policy；
- `vem_get_active_session`：明确 project/browser/document，不返回模糊全局 active；
- `vem_list_selections`：分页 summary；
- `vem_get_selection`：不可变 snapshot summary；
- `vem_claim_selection`：为服务端派生的 MCP client session 创建短期工作流 claim；
- `vem_release_selection_claim`：释放当前 consumer 持有的 claim；断线时仍由 TTL/grace 兜底；
- `vem_get_context`：接受显式 `ContextRequest`；
- `vem_resolve_source`：证据、候选、冲突、共享影响；
- `vem_get_runtime_diagnostics`：分级、分页、去敏 diagnostics；
- `vem_prepare_verification`：在编辑前固定 claim、VerificationSpec、before Observation 和 revision barrier；
- `vem_wait_for_update`：接受 runId、timeout 和 cancellation，从 barrier journal cursor 等待/回放因果 transaction；
- `vem_complete_verification`：在编辑与测试后完成等待、重定位、after Observation 和断言；
- `vem_get_capture`：resource 不兼容时返回 image content。

不得提供绕过 prepare barrier 的“编辑后直接验证”便利工具。若保留旧 `vem_verify_selection` 名称，只能作为对已经 prepared 的 `runId` 调用 complete 的别名，不能在调用时临时生成 before Observation。

旧的 `vem_get_dom_context` 和 `vem_get_visual_context` 可以保留为 `vem_get_context` 的便利包装，但核心协议使用统一 ContextRequest，避免工具数量和策略漂移。

## 14.3 Resources

- `vem://selection/<snapshotId>`（不可变，不发送 updated notification）；
- `vem://session/<id>/active-selection`（可变，可以订阅）；
- `vem://capture/<id>`；
- `vem://diagnostics/<session>/<cursor>`；
- `vem://verification/<runId>`；
- `vem://session/<id>/verification-index`（可变，可以订阅）。

resource read 要校验 session binding、TTL 和 quota。subscription 只用于可变 index/active URI；notification 只表示 URI 已变化，客户端必须重新 read。capture、不可变 selection 和 verification 可以仅由工具返回 resource link，不要求全部出现在 `resources/list`。不支持 subscription 的客户端继续使用分页读取与 `vem_wait_for_update`。工具返回 resource link 不代表该资源永久存在。

## 14.4 Error model

至少包含：

- `NO_ACTIVE_PROJECT`；
- `NO_BROWSER_SESSION`；
- `AMBIGUOUS_SESSION`；
- `STALE_DOCUMENT`；
- `STALE_REVISION`；
- `SELECTION_NOT_FOUND`；
- `SELECTION_CLAIM_CONFLICT`；
- `SELECTION_CLAIM_EXPIRED`；
- `CONFIRMATION_TARGET_CHANGED`；
- `CONFIRMATION_SOURCE_CHANGED`；
- `CONFIRMATION_ACTION_NOT_ALLOWED`；
- `CONFIRMATION_EXPIRED`；
- `CONFIRMATION_ALREADY_USED`；
- `CONFIRMATION_INVALIDATED`；
- `CONFIRMATION_INTEGRITY_INSUFFICIENT`；
- `SELECTED_NODE_DETACHED`；
- `SOURCE_UNRESOLVED`；
- `CAPABILITY_UNAVAILABLE`；
- `CAPTURE_EXPIRED`；
- `CAPTURE_TARGET_CHANGED`；
- `CAPTURE_EPOCH_INVALIDATED`；
- `QUOTA_EXCEEDED`；
- `BACKPRESSURE_BUSY`；
- `AUTH_FAILED`；
- `PAIRING_BOOTSTRAP_INVALID`；
- `ORIGIN_REJECTED`；
- `REQUEST_CANCELLED`；
- `UPDATE_TIMEOUT`；
- `VERIFICATION_NOT_PREPARED`；
- `VERIFICATION_BARRIER_EXPIRED`；
- `AMBIGUOUS_UPDATE_TRANSACTION`；
- `UPDATE_SCOPE_UNRESOLVED`。

VEM error payload 统一包含：

```ts
interface VemError {
  code: VemErrorCode;
  message: string;
  retryable: boolean;
  suggestedAction?: string;
  currentDocumentId?: string;
  currentRevision?: ProjectRevisionContext | RevisionContext;
  limitations?: string[];
}
```

未知工具、无效 JSON-RPC 和不符合 tool input schema 的请求使用 protocol error；stale、capability unavailable、业务校验和 provider 失败使用带 `isError: true` 的 tool execution error，使 Codex 可以安全修正或重试。

---

# 十四、HMR 与验证

## 15.1 HMR State Machine

```ts
type HmrState =
  | "idle"
  | "detected"
  | "compiling"
  | "server-ready"
  | "sent-to-browser"
  | "browser-applied"
  | "dom-settling"
  | "stable"
  | "failed";
```

Vite adapter 必须把现有 `handleHotUpdate` 与 Vite 未来/环境 API 的 `hotUpdate` 封装在一个内部 seam 后，并用固定 matrix fixture 验证；升级 Vite 时不能让 hook 名称变化静默丢失 journal evidence。无论使用哪个 hook，server hook 只表示服务器处理更新，不表示 Edge 已完成 React commit 和布局。每次更新必须保留因果范围：

```ts
interface UpdateTransaction {
  revision: ProjectRevisionContext;
  changedModules: string[];
  affectedModules: string[];
  deliveryKind: "hmr" | "css-update" | "full-reload";
  serverObservedAt: string;
}

interface UpdateMatchEvidence {
  transactionRevisions: ProjectRevisionContext[];
  matchedTargetModules: string[];
  ignoredUnrelatedTransactions: string[];
  sources: Array<"vite-module-graph" | "source-registry" | "codex-reported">;
  limitations: string[];
}

interface BrowserApplyReceipt {
  revision: RevisionContext;
  viteAfterUpdateObserved: boolean;
  frameworkCommitEvidence?: Evidence<unknown>;
  targetReattached: boolean;
  settledBy: "mutation-quiet" | "framework-adapter" | "assertion-poll";
}
```

`vem_wait_for_update` 接受 prepared `runId`，以 VerificationBarrier 的 project instance、journal cursor、document generation、source/build identity 和 prepare 时固定的 target scope 为起点，等待相关 update batch 的 browser-applied + settle，而不是任意较新 revision。调用发生前已经完成但位于 cursor 之后的 transaction 必须可以从有界 journal 回放。

相关性规则必须可测试且 fail closed：

1. `changedModules`/`affectedModules` 与 target scope 的 module/dependency closure 有 registry-matched 交集时，transaction 才是相关候选；
2. 没有交集的 transaction 记录为 ignored，不满足等待；barrier 后只有一次无关 HMR 时必须继续等待，最终 timeout/ambiguous，绝不能 passed；
3. 同一次用户保存引发的 JS、CSS、Fast Refresh 或 formatter 连续 transaction，可以在有界 quiescence window 内合并为一个 update batch，但必须保留所有 revision 和交集 evidence；
4. 多个彼此竞争的相关 batch、full reload 后 scope 无法重建、module graph 不完整或只有 Codex 自报文件而无 coordinator-observed 交集时返回 `ambiguous`；
5. `reportedChangedFiles` 只能帮助解释候选，不能代替 Vite/module-registry evidence；支持矩阵外无法获得 affected module 时不得自动 passed。

P0 walking skeleton 的最小 settle 为：相关 update batch 的 Vite afterUpdate/full-reload receipt → 两个 animation frame → MutationObserver 静默窗口 → 目标重新定位和断言轮询。字体、动画、caret 和视觉 mask 的完整稳定化在视觉阶段增强。返回值包含最后状态、diagnostics、`UpdateMatchEvidence`、observed batch 和 timeout/cancel 原因。

## 15.2 VerificationSpec

```ts
interface VerificationSpec {
  exists?: boolean;
  text?: { equals?: string; contains?: string };
  styles?: Record<string, StyleExpectation>;
  box?: {
    widthDelta?: Range;
    heightDelta?: Range;
    remainInsideParent?: boolean;
  };
  accessibility?: AccessibilityExpectation[];
  visualReview?: boolean;
}
```

## 15.3 ObservationDiff

```ts
interface ObservationDiff {
  before: Observation;
  after: Observation;
  assertions: AssertionResult[];
  status: "passed" | "failed" | "ambiguous" | "needs-review";
  warnings: string[];
}
```

客观断言满足才能自动 passed。主观“更现代”只能自动检查未消失、未溢出、无明显回归，并返回截图与 `needs-review`。截图像素变化本身不是完成证据。

## 15.4 视觉稳定化

视觉比较应记录 OS、Edge/Chromium version、DPR、zoom、字体和 viewport；支持禁用动画、隐藏 caret、遮罩动态区域和等待字体。跨环境 baseline 不直接比较。视觉阈值必须在 fixture 中校准，不能把目标当作已实现事实。

---

# 十五、安全与隐私

## 16.1 默认安全边界

- development only；
- local service 绑定 loopback 或本机 IPC；
- 浏览器使用短期、可撤销、project-bound pairing token；
- token 不进入页面、DOM、URL、日志或同步存储；
- 校验 origin/host/sender/tab/frame/document/revision；
- 浏览器永不获得绝对源码路径、文件读取、Shell 或任意 URL 能力；
- remote mode 必须显式启用 HTTPS/WSS、强认证、过期会话和审计；
- 不自动打开公网或扫描内网。

### 16.1.1 Remote 与 SSH 安全边界 (`REMOTE-SEC-001`)

P7 之前 remote/SSH capability 必须报告 unavailable，配置中出现 remote endpoint 也要明确拒绝，不能静默退回不安全 HTTP/WS、复用任意旧 tunnel 或把 localhost 当成已授权远端。P7 实现时必须由用户显式选择精确 project、host 与 endpoint；规范化后只允许 allowlist 中的 `https:`/`wss:` endpoint，SSH 必须验证 host key。认证需要强凭据、短期会话、最小授权、撤销、过期、速率限制和不含 secret 的审计；DNS 解析、redirect、代理和重连都要重新执行 SSRF/private-network 与 DNS-rebinding 防护。任何 host/project/identity/证书/host-key 不一致都 fail closed，不得把 scoped bearer 或 SSH tunnel 本身描述为用户意图证明。

### 16.1.2 Container 安全边界 (`CONTAINER-SEC-001`)

P7 之前 container capability 必须报告 unavailable。P7 的 documented container workflow 必须固定 image version 与 digest，使用非 root UID/GID，禁止 privileged、host PID/IPC、Docker socket 与新增 Linux capabilities，并在可行时使用 read-only root filesystem。只允许挂载用户明确选择且 realpath 后仍位于精确 project root 的路径；默认项目 mount 只读，只有明确的实现动作才授予最小写路径，禁止挂载 host `/`、整个 home、SSH agent 或未列入 allowlist 的 credential directory。

secret 只通过有界 secret reference/file descriptor 注入，不进入 image layer、命令行、环境 evidence 或日志。暴露端口、egress 与 DNS 目标采用最小 allowlist；容器退出、取消、失败与重试都必须清理临时 mount、network、secret reference 和进程。symlink/path escape、镜像 digest 漂移、UID 映射失败、权限扩大或 cleanup 不完整时 fail closed。不得因为容器提供了隔离表象就放宽 VEM 的 project、browser、token、privacy 或 remote contract。

## 16.2 最小权限

Edge Extension 默认请求 `activeTab`、`scripting`、必要 messaging/storage 权限；不默认请求 `<all_urls>`、`debugger`、cookies、history 或 arbitrary network。动态 dev origin 使用精确 `optional_host_permissions` 或固定 loopback broker；跨 origin 导航后重新确认。高级 CDP 能力以可选权限和用户手势启用。manifest 必须声明并测试最低 Edge/Chromium 版本，尤其覆盖 `storage.session`、`sender.documentId` 和 Service Worker WebSocket 生命周期差异。

## 16.3 隐私过滤

默认不采集：

- password 和所有 input 当前 value；
- cookie、token、Authorization；
- URL query/fragment、原始 pathname segment 和 title 中的敏感值；
- CSS `url()` 中的 query/token；
- `data-vem-private` 子树；
- 用户配置 selector；
- 大段用户生成内容；
- console 中匹配 secret pattern 的内容。

可见文本、aria label、placeholder 仍可能含个人信息，必须有长度限制、preview 和显式 detail 请求。传给 Codex 的页面文本标记为不可信 data，不能被解释为系统指令。

截图属于独立数据类型，不能因为 DOM 字段通过过滤就自动获准。截图遵循 10.1 的 consent、origin allowlist、本地 mask/crop 和 capture audit 规则；无法证明遮罩生效时 fail closed。

## 16.4 路径安全

任何服务端源码路径：realpath、解析 symlink、验证在 project root、拒绝 `..`/设备文件/外部路径。浏览器只使用 opaque ID。MCP 向 Codex 返回相对路径；需要绝对路径时由受控本地端解析。

## 16.5 生产剥离 (`PROD-LEAK-001`)

自动测试证明：

- production bundle 无 VEM client、endpoint、mapping 和生成 marker；
- plugin 在 build 时不执行 dev transform；
- 用户自己的同名 attribute 不被误删；
- 安装 VEM 不改变应用生产行为；
- source map 是否生成仍遵循用户项目配置，但 VEM 不额外暴露调试 map。

该安全属性从引入 dev transform 的同一原子任务开始测试：P0 source-transform task 必须立即证明 build command 不执行 marker/client/endpoint transform，并保护用户已有同名或广义 `data-*` attribute；P0 phase CI task 再对完整 workspace、安装/卸载路径和产物搜索执行发布级 leakage gate。不得在 transform 合入后把第一条 production-safety 测试推迟到阶段末尾。

## 16.6 用户可见安全与恢复状态

popup/overlay 必须清晰展示当前 project、origin、tab/document、provider 和采集状态。`stale`、`ambiguous`、`degraded`、`needs-review`、token expired、coordinator offline、permission denied 不得只写入日志；用户应看到原因、影响和安全的恢复操作。

用户界面至少提供：重新配对、撤销权限、清除当前 session/项目/全部数据、选择 source candidate、重新捕获和退出选择模式。扩展正在采集截图或敏感 detail 时必须有不可由页面伪造的扩展级指示。默认不上传产品遥测；若未来增加 telemetry，必须独立 opt-in，且不得包含 DOM、截图、源码路径或 token。

---

# 十六、性能预算

- hover 在声明的基准机器/页面规模上 p95 frame time 不超过 16.7 ms，目标接近 60 FPS（Frames Per Second，每秒帧数）；
- 每帧最多一次 box read；
- selection summary 目标 8–16 KB、硬上限 32 KB；
- DOM detail 默认不超过 40 节点，硬上限 100；
- computed style 使用 profile whitelist；
- screenshot 默认元素 2 MB、全页 10 MB；
- diagnostics 默认每 tab 1 MB/500 条；
- source transform 冷启动额外开销目标不超过基线中位数 20%，HMR 额外开销 p95 不超过 100 ms；
- benchmark 必须记录硬件、OS、Edge/Node/Vite 版本、fixture 大小、warmup、样本数和 p50/p95；没有这些元数据的数字只算观察值，不算 gate evidence。

## 16.7 产品效果与正确性指标

从 P0 建立 10–20 个可重复 golden tasks；P3 扩大到至少 50 个并覆盖 wrapper/HOC、barrel export、dynamic import、name collision、list key、shared component、anchor migration、unrelated HMR 和 ambiguous mapping；P4 另保留未参与调参的 holdout 集。阶段 gate 记录：

- source candidate top-1/top-3 命中率；
- 用户切换祖先、改选 target 或 source candidate 的比例；
- selection 到 MCP summary 可用的 p50/p95；
- ContextRequest 实际字节数和估算 token 数；
- 首次源码编辑后的客观 verification 通过率；
- shared definition 误改、错误 reattach 和错误 transaction attribution 数量；
- false-positive `passed` 数量，所有 release gate 必须为 0；
- 因证据不足正确返回 `ambiguous`/`needs-review` 的用例通过率。
- 全新环境从安装到首次成功 selection 的 p50/p95；
- pairing 首次成功率、失败原因和安全恢复成功率；
- selection 到用户确认正确 source candidate 的时间，以及相对不使用 VEM 的基线提升；
- 首次 edit 被保留、改选、撤销或需要人工修正的比例；
- clean uninstall 后项目配置、生产构建和用户数据的残留数。

尚未到达对应 capability 阶段的 golden task 应记录预期的 `CAPABILITY_UNAVAILABLE`/limitation，而不是伪造执行结果；每个 phase gate 只对该阶段承诺的任务子集设通过阈值，同时保留完整矩阵以展示能力增长。holdout 结果必须与调参集分开报告。这些指标用于比较阶段和策略，不得通过缩小 fixture、删除 ambiguous 用例或把失败改为 warning 来制造提升。没有 golden-task 和真实 clean-install evidence 的“更准确”“更快”“可日常使用”只算产品假设。

# 十七、测试体系与验收矩阵

## 17.1 测试层级

### Unit（单元测试）

- selector state/filter/ancestor；
- message schema、size/depth limit；
- sender-derived identity；
- source ID 与 revision；
- RevisionContext ordering/equality and project-instance reset；
- selection claim TTL/conflict/release；
- context projection；
- task intent/context plan；
- queue priority/backpressure/idempotency；
- cache invalidation；
- runtime/target/viewport observation epoch 与 verification cache bypass；
- TTL/quota/lease/deletion；
- fallback policy；
- confidence/evidence；
- path safety。

### Integration（集成测试）

- 真实 MCP STDIO/Coordinator 与独立 Vite OS process、用户私有 runtime discovery、同源 proxy 和 project-instance restart；
- Vite injection/transform/mapping；
- injected selection provenance、external confirmation binding 与 active-selection spoof；
- Page Runtime → Content Script → Service Worker；
- Edge extension → coordinator；
- coordinator → MCP；
- binary capture upload/resource read；
- HMR server event → Edge ACK；
- prepare barrier → early HMR journal replay → complete verification；
- reconnect、service worker restart、stale document；
- UDS/Named Pipe/loopback transport；
- production leakage。

### E2E（End-to-End，端到端测试）

发布门禁优先 Edge Stable on Windows：

1. 在 milestone 要求时从 fresh project/profile 安装开发分发并生成 Codex 配置；
2. 打开 fixture；
3. 选择 intrinsic button；
4. 获取 source resolution；
5. 修改 fixture source；
6. 运行目标测试；
7. 等待相关 HMR batch stable；
8. text/box/style assertion；
9. screenshot/resource；
10. diff 和 shared-impact 报告；
11. 撤销 pairing、clean uninstall 并检查 production/runtime/token/artifact residue。

快速 CI 可使用 Playwright Chromium；release gate 必须包含 `channel: msedge`。Chrome Stable 做兼容 smoke test。

### Contract（契约测试）

- protocol/tool input/output JSON Schema；
- structured content；
- MCP image/resource/error；
- version negotiation；
- primary/compat revision 与 task/no-task extension negotiation；
- cancellation/progress；
- resource expiry。

### Security（安全测试）

- pairing bootstrap code 缺失、猜错、过期、并发消费、恶意网页和未持 code 的本机 client；
- 页面伪造 postMessage；
- compromised content script crafted payload；
- sender/tab/frame/document mismatch；
- replay/sequence/requestId；
- illegal token/origin；
- DNS rebinding/localhost abuse；
- path traversal/symlink escape；
- oversized/nested payload；
- prompt injection DOM text；
- P0 SelectionSummary/private field/URL/error-echo redaction；
- content script 无法读取 session token、pairing binding 或 local project metadata；
- MIME spoofing/polyglot capture；
- unauthorized resource ID；
- production leakage；
- remote mode fail closed。

### Reliability/Data lifecycle

- P3 memory-first resource 在 session clear/process exit 后删除且不谎称 pin；P6 durable resource 才测试 crash/orphan recovery；
- queue full/drop policy；
- service worker sleep/restart；
- coordinator crash/reconnect；
- duplicate selection idempotency；
- concurrent MCP consumers and claim expiry；
- interrupted screenshot upload；
- orphan cleanup；
- lease prevents premature deletion；
- absolute TTL；
- quota pressure LRU；
- manual clear/revoke token。

### Performance

- 1,000/10,000 DOM nodes hover；
- large TSX transform/cache；
- 100 selections burst；
- diagnostics flood；
- binary screenshot throughput；
- context request cache hit/miss；
- Edge zoom 100/125/150%；
- Windows DPR 100/150/200%。

## 17.2 Fixture matrix

- button、nested span/button、form、empty background；
- list/map with React key；
- shared Button usages；
- CSS Module、Tailwind、CSS variables、global/inherited CSS；
- Flex/Grid、container/media query；
- conditional、Fragment、Portal modal、SVG；
- open Shadow DOM、iframe same/cross origin；
- fullscreen/top-layer dialog；
- long page/scroll/zoom/DPR；
- HMR line shift、CSS-only update、full reload、compile error；
- prepare 后 wait 调用前即完成的 HMR、无关并发 HMR、多个候选 transaction；
- 多个 MCP client 同时读取/claim 同一 selection；
- screenshot 遮罩期间切换 active tab、导航和 DOM/mask 变化；
- Vite/React plugin/Babel-SWC/JSX runtime 支持矩阵内外组合；
- malicious DOM/message/oversized data；
- Edge extension disabled by site/enterprise policy；
- Service Worker 30 秒 idle/termination/WebSocket keepalive/reconnect 与最低版本；
- Windows、Linux、WSL+Windows Edge、container、SSH remote；
- production build。

## 17.3 原子任务门禁

每个任务：相关测试、affected package typecheck/lint、diff review、无 skip/弱化测试、更新 evidence。Phase gate 再运行完整相关 unit/integration/E2E/security/performance subset。

task dependency 只检查前置工作是否完成；投资/发布授权由稳定逻辑 decision key 的当前 immutable attempt 检查。next-task selector 和 validator 必须同时验证 `depends_on`、phase dependency、`requires_decisions`、decision key 所属 phase、current-attempt 指针、唯一递增 attempt ordinal 和完整 supersedes 链，不能把 decision task 的 `done` 当成隐含 `continue`。旧 verdict 不得覆盖；`adjust` 必须先产生 remediation task 与新的 attempt task，`stop` 必须使 owning phase failed。仅绑定 `TEST-GATE-001` 的任务还必须证明它只增加测试/fixture/验证编排，没有实现新的领域规范行为。

一个原子任务默认只允许一个主要 authority boundary、一个主要持久状态类别、一个主要协议 surface 和一个可独立验收结果；预计实现与验证明显超过 1–3 个正常工作日，或同时出现两个可独立回滚/发布的结果时，执行前必须拆分 roadmap task。ADR 可以与它直接约束的首个窄实现同任务交付，但“ADR + 多个实现子系统 + 安装/迁移/E2E”不得合并为一个状态。拆分时保留旧 ID 作为父级审计说明或在 progress 中记录 superseded mapping，所有依赖必须改指向真正提供所需 seam 的子任务。

---

# 十八、仓库与模块边界

```text
visual-element-mcp/
├── AGENTS.md
├── PLANS.md
├── ROADMAP.yaml
├── scripts/
│   └── preflight/
├── docs/
│   ├── DESIGN.md
│   ├── requirements.yaml
│   ├── specifications/
│   ├── architecture/
│   ├── adr/
│   ├── progress.md
│   └── test-evidence/
├── packages/
│   ├── protocol/
│   ├── selector-core/
│   ├── overlay-ui/
│   ├── page-runtime-adapter/
│   ├── browser-extension/
│   ├── source-index/
│   ├── vite-plugin/
│   ├── transport/
│   ├── coordinator/
│   ├── mcp-server/
│   └── codex-plugin/
├── apps/
│   └── demo-react-vite/
├── fixtures/
├── benchmarks/
│   └── golden-tasks/
└── e2e/
```

以下可先作为 coordinator 内部模块，不要求过早拆包：

- ingress validators；
- evidence graph；
- context policy；
- bounded queue；
- cache；
- artifact store；
- data lifecycle；
- capability/fallback；
- HMR state machine；
- verification engine。

只有接口稳定或需要独立复用时才拆 package。

---

# 十九、实施路线原则

详细任务以 `ROADMAP.yaml` 为准。路线必须采用垂直切片，而不是先完成所有 selector、mapping、coordinator 和 MCP 层后才集成。

推荐阶段：

1. P0：先以 P0-T0A0 只读盘点，再由 P0-T0A1 执行 owner-authorized layout commit 与 single-writer cutover，P0-T0A2 固定 evidence/toolchain，随后完成 bootstrap preflight；建立最小 workspace 后再通过固定 Playwright 的真实 Edge channel gate。在 selector、anchor 和 fixture 可用后运行 3–5 项隔离、预登记 value micro-pilot，只有逻辑 `P0-VALUE` 的 current attempt 为 `continue` 才继续 topology 与 verification 投入；将 transform 与 registry、topology、proxy/build channel、MCP initialization/capability、consumer/confirmation、bounded tools/resources、verification prepare、update matching 和 complete 拆成可独立失败的原子任务，完成真实双进程 Edge Vite 注入式 walking skeleton（P0 reference topology→最小隐私与 selection provenance→选择→anchor→最小 EvidenceGraph/source resolution→value micro-pilot→prepare barrier→相关 HMR batch journal replay→文本验证→生产无泄漏）；
2. P1：加固注入式 MVP 已有的 bounded context 与最小 EvidenceGraph，并补全 anchor reconciliation、consumer claim、错误/恢复、交互完整度和干净安装/卸载；
3. P2：Edge MV3 扩展、分层信任、带一次性 bootstrap code 的 scoped bearer 配对、可复现 sideload 包、Tier-1 Windows/WSL 和本机 transport；container/SSH/remote 留到 P7；
4. P3：先建立最小隔离 binary lane/回压，再交付真实视觉垂直切片（有界 style/layout、短时 memory-first resource、capture epoch、竞态安全截图、最小 React key claim 和几何验证），随后补全 cache、diagnostics 和 fallback；不为尚未出现的参考图/历史产品面板提前建设 durable artifact；
5. P4：高级 StyleEvidence、视觉稳定化、主观 review 和 Edge 视觉发布矩阵；
6. P5：完整 owner/usage、共享影响和多选；
7. P6：随参考图首次引入 durable artifact/lifecycle，再交付 behavior diagnostics、参考图、page-root/region；
8. P7：Edge CDP、remote、Chrome compatibility、商店分发和正式迁移；
9. P8：多框架评估。

P0 只允许实现 walking skeleton 所需的最小协议、最小 EvidenceGraph、RevisionContext、真实进程 topology、prepare/complete barrier 与安全底线；`PRIV-MIN-001`、`SEL-PROV-001` 和 transform-level `PROD-LEAK-001` 属于这条安全底线，不能因 P3 有更完整 projection 或阶段末有 CI gate 而推迟。完整扩展、高级 transport 和 durable artifact 随首次使用它们的阶段交付，ADR 则随其约束的首次公开决策交付。P1 可以扩展 EvidenceGraph 的 provenance、freshness、conflict 和恢复行为，但不得把 P0 的 source resolution 降格为无证据映射。P3 的首批任务必须先得到短时、默认内存资源、独立 binary lane 和竞态安全 capture 的真实视觉证据；短时资源必须有 ownership、硬 TTL、quota、lease、manual/session clear 和 process-exit deletion，但不承诺跨进程 pin/orphan recovery。durable store、atomic temp upload、tombstone 和 orphan sweeper 到 P6 参考图首次需要持久化时再交付；crash-safe control journal 和 bounded audit metadata 按 `DATA-LIFE-001` 使用独立最小 store，不等于提前提供 durable artifact。开发者可安装产物、配置生成和 clean-install 不能推迟到商店分发阶段。每个后续 phase 先保持上一条路径可运行，再扩展完整度。任何被早期 gate 依赖的 bounded input、evidence、settle、transport 或 production-safety 能力不得推迟到后期 phase。

---

# 二十、Codex 页面修改工作流

1. 获取明确 project/browser/document session、服务端派生的 MCP client session 和 CapabilityReport；
2. 获取 immutable SelectionSnapshot、SelectionProvenance 与 SourceResolution，在用户可见会话中展示目标、provider、confirmation integrity 和主要 source candidate；
3. 将 selection 显式绑定到当前 prompt/用户确认并 claim；注入模式的 page-untrusted selection 必须先完成外部确认，后续工作流只使用 claim 绑定的 snapshot，不跟随 active-selection；
4. Codex 可在本地形成 `TaskIntent { primary, secondary }`，但不把分类当作 VEM 权限或协议事实；
5. 生成显式 ContextRequest，只请求必要 `needs` 和 limits；
6. 检查 evidence/conflicts/warnings/shared impact；
7. 阅读最小源码集合；
8. 制订 VerificationSpec，并调用 `vem_prepare_verification` 原子保存 before Observation 和 barrier；
9. 修改真实源码；
10. 运行目标测试、typecheck、lint；
11. 用 prepared runId 等待或回放 barrier 之后的目标 HMR transaction；
12. 调用 `vem_complete_verification`，重新定位并执行 VerificationSpec；
13. 视觉/主观任务返回 capture 和 needs-review；
14. 审查 diff、共享影响和数据降级；
15. release claim，报告 changed files、commands、tests、browser evidence 和 limitations。

失败处理：

- capability unavailable：按 FallbackPolicy 显式失败/降级；
- claim conflict/expired：停止自动编辑，重新取得用户可见的目标 claim；
- low confidence：先搜索和交叉验证；
- ambiguous：停止自动编辑并列候选；
- tests fail：不进入验证完成；
- barrier expired/project instance changed：重新 prepare，不能用编辑后的页面伪造 before；
- HMR fail/timeout/多个候选 transaction：读取 diagnostics，并返回 failed/ambiguous；
- node detached：重定位，仍失败则报告 stale/missing；
- screenshot expired：重新捕获，不能用旧图冒充；
- subjective visual：`needs-review`，不能谎称 passed。

---

# 二十一、风险与缓解

| 风险 | 缓解 |
|---|---|
| 把页面 runtime claim 当事实 | Evidence origin、逐层校验、服务端 registry、源码交叉验证 |
| 注入页面伪造或替换用户 selection | SelectionProvenance、page-untrusted capability、prompt/confirmation binding、immutable claim |
| token 被页面脚本读取 | token 只在 Service Worker/session storage，content/page 无 secret |
| content script 被利用 | Service Worker 再验证 sender/action/request/quota，最小权限 |
| 大 DOM/截图堵塞控制消息 | 控制/数据面分离、二进制流、有界队列和回压 |
| cache 在代码 revision 未变时返回旧运行时页面 | runtime/target/viewport epoch、短 TTL/revalidation，verification fresh observation，stale 不用于 passed |
| 截图/日志无限增长 | TTL、absolute TTL、quota、lease、LRU、sweeper、手动清除 |
| 回退悄悄降低安全 | strict/balanced/compatibility policy，禁止安全底线回退 |
| HMR event 早于页面完成 | browser ACK + DOM settle 状态机 |
| loop/shared component 误改 | runtime/source identity 分离、React key evidence、sharedImpact unknown |
| CSS provenance 被高估 | StyleEvidence 分层、limitations、可选 CDP |
| 跨 Windows/WSL/远程失败 | Transport Adapter、同源 browser endpoint、SSH STDIO、显式 remote |
| Edge 企业策略 | capability probe、明确 policy error、Chromium CI fallback 不冒充 Edge gate |
| 视觉比较不稳定 | 固定环境、动画/字体/caret/mask、几何断言优先 |
| 任务分类错误 | primary+secondary、增量 context、分类不是安全/权限边界 |
| MCP revision/Tasks 演进造成 wire churn | primary+compat revision ADR、task/no-task adapter matrix、核心闭环不依赖 Tasks |

---

# 二十二、产品完成定义

项目只有在以下条件同时满足时才算实现设计目标：

- Edge Stable 是经过自动和手工验证的主路径；
- 免浏览器扩展安装的 Vite 注入与扩展/CDP 能力边界清晰，且不把项目集成宣传为零安装；
- 页面、content script 和 service worker payload 的信任边界诚实；
- token 不进入页面环境；
- DOM、component、source 多对多关系以 evidence graph 表达；
- source/runtime/reattach identity 分离；
- 数据按需采集，控制面不被大对象阻塞；
- queue 有回压、消息有幂等、连接可恢复；
- cache 有 revision invalidation；
- screenshot/DOM/log 有 TTL、quota、lease 和删除规则；
- fallback 可见、可配置且不降低安全底线；
- HMR 经过浏览器 ACK；
- verification 基于明确断言，主观任务需要 review；
- production build 无 VEM 泄漏；
- 用户知道改了什么、测试是否通过、浏览器是否验证、影响哪里、哪些结论仍不确定。
- Visual V1 可以从全新环境安装、完成首次配对/选择并干净卸载，不依赖后续商店分发阶段。

---

# 附录 A：关键验收用例

1. nested span/button 可切换且 overlay 不挡点击；
2. `.map()` 多实例 sourceAnchor 相同、runtime identity 不同，排序后不误认；
3. shared Button 无法确定 usages 时返回 unknown；
4. page-root 返回 graph 而非单一 `body` 源码；
5. region 只吸附/成组，不生成半段源码；
6. “按钮变大”验证尺寸增长、父容器未溢出；
7. “更现代”返回前后截图和 needs-review；
8. forged postMessage/content payload 不触发 privileged action；
9. screenshot upload 不阻塞 HMR ACK；
10. service worker restart 后 token/session 可恢复且页面无 secret；
11. TTL、quota、manual clear、orphan cleanup 生效；
12. strict fallback 在 extension 缺失时失败，balanced 明确降级；
13. Windows、Linux、WSL+Edge 和 SSH remote transport 不串 project；
14. production output 无 VEM artifact。
15. 未经扩展 UI 确认且未原子消费终端一次性 bootstrap code 的 discovery hint 不能完成 pairing，缺少/猜错/并发消费 code、重放 challenge 和 coordinator instance 变化均失败；
16. `activeTab` 跨 origin 导航后权限失效，扩展不会静默扩大 host permission；
17. password/private selector/跨 origin iframe 在截图上传前已本地遮罩，无法遮罩时拒绝 capture；
18. 无关文件 HMR revision 不能满足目标更新等待，CSS update、full reload 和 compile error 状态可区分；
19. JSX 插入兄弟节点后旧 anchor 通过 migration evidence 重定位，候选接近时返回 ambiguous；
20. 不可变 selection resource 不发 updated notification，可变 active-selection URI 通知后由客户端重新读取；
21. Service Worker 和 coordinator 异常终止后，只从有界 control-state journal 恢复非敏感状态。
22. verification 在编辑前 prepare；即使 HMR 在 wait 调用前完成，也只能从 barrier cursor 后回放正确 transaction；无关并发更新返回 ambiguous。
23. 两个 MCP client 同时读取 selection 时不会串目标；自动编辑使用有 TTL 的 claim，active-selection 变化不影响已 prepared run。
24. `captureVisibleTab` 的 capture epoch 内任何 tab 激活、导航、document/mask invalidation 事件（包括 A→B→A）都会丢弃截图，动态像素无法遮罩时不上送，并遵守每 window 串行与平台速率上限。
25. scoped bearer token 的风险、存储、rotation generation、浏览器重启和撤销行为与协议描述一致，不把它冒充 proof-of-possession。
26. golden tasks 记录 source top-k、payload、首次验证成功率、ambiguous correctness 和 false-positive passed；release gate 的 false-positive passed 为 0。
27. P0 E2E 使用真实 Vite 与 MCP OS process，经用户私有 runtime discovery 和 `/__vem/browser` 服务端代理闭环；关闭/restart 任一进程不会复用旧 project instance。
28. barrier 后只有无关 HMR 时 verification 不会通过；相关与无关更新交错、多次保存和 JS+CSS batch 均保留可解释 match evidence。
29. P1/P2/P4 分别通过对应开发产物的 clean install、首次连接/配对和 clean uninstall，Visual V1 不依赖 P7 才能被新用户安装。
30. P0 在任何 selection summary 出站前过滤表单 value、private subtree、URL secret 和 prompt-injection payload；兼容 text output 不能丢失 untrusted-data 标记。
31. 注入页面伪造 active selection 时，SelectionProvenance 保持 page-untrusted，未完成外部 prompt/confirmation binding 的 strict workflow 不能 prepare edit。
32. 相同 build/source revision 下异步 DOM 文本、目标尺寸、scroll/zoom 或 route state 变化会使相关 context cache 失效；verification 不使用普通 cache 产生 passed。
33. no-task MCP client 可以完成 prepare/wait/complete；若协商 Tasks，则旧 experimental 和新 extension wire shape 不会混用。
34. content script 无法读取 storage.session token、pairing binding 或 storage.local project/origin metadata；扩展升级后 access level 仍保持 trusted contexts。
35. P1 pilot 的 threshold、holdout、no-VEM baseline 和计时边界在执行前登记，失败结果不会通过事后换样本或降阈值变成 passed。
36. P0-T0A0–P0-T0G 在 staging identity/payload、owner-authorized layout commit、prefix-normalized parity、single-writer cutover、target ext4 Git-root、固定 Node/pnpm/Playwright、真实 `msedge` direct smoke 与 Playwright channel、HTTP/WS/HMR、双进程、loopback 暴露和 private runtime ACL 任一项未通过时保持 blocked；只找到可执行文件或只跑 Linux Chromium 不能冒充 Tier-1 passed。
37. P0 value micro-pilot 在 topology/verification 大量建设前完成 3–5 个预登记定位任务；两 arm 使用隔离 Codex context 和交叉平衡顺序，ground truth 对参与路径隐藏，setup 与 per-task cost 分开；错误 source attribution 或无可观察价值改善会暂停后续投入，且该样本不得污染后续 holdout。
38. roadmap task 的直接 `contracts` 与 `docs/requirements.yaml` 反向映射双向一致；缺失绑定、未知 contract 或只修改一侧都使 validator 失败。
39. decision task 可以在 `status: done` 时记录 `adjust/stop`，但所有要求 `continue` 的 task/phase 仍不可执行；logical key/current-attempt/supersedes/ordinal 缺失、未知或不匹配使 validator 和 next-task selector 失败，旧 verdict 不可覆盖。
40. P0 ephemeral selection/claim/confirmation state 在 session/project restart 与显式 clear 后不可恢复，且最小静态 CapabilityReport 不宣称 P2/P3/P6/P7 能力。
41. P7 container workflow 固定 image digest、non-root、drop capability、精确 project mount、无 Docker socket/host root/home mount，并在 secret/network/path/cleanup 任一边界不明时 fail closed；container 隔离不替代 VEM trust/privacy contract。

# 附录 B：调研与实现参考

以下资料用于学习产品模式、协议或平台能力，不代表可以复制其代码。最近复核日期为 2026-07-13；P0-T2 起 blocking CI 检查仓库内部链接与 requirements section，外部 URL 采用可重试的定期 reference audit 并记录最后成功日期，不能因临时网络故障阻塞每次本地提交。采用具体实现前还必须在 ADR 中记录所参考的 release/tag/commit，避免随网页更新而改变设计依据：

- Stagewise 当前产品与 DOM context selection：<https://docs.stagewise.io/>
- Stagewise repository（AGPL-3.0）：<https://github.com/stagewise-io/stagewise>
- Frontman architecture：<https://frontman.sh/docs/reference/architecture/>
- Frontman repository（libs Apache-2.0、server AGPL-3.0）：<https://github.com/frontman-ai/frontman>
- React Grab（MIT）与 changelog：<https://github.com/aidenybai/react-grab>、<https://www.react-grab.com/changelog>
- Vite Plugin API、client HMR 与 Environment `hotUpdate` hook：<https://vite.dev/guide/api-plugin>、<https://vite.dev/guide/api-hmr>、<https://vite.dev/guide/api-environment-plugins#the-hotupdate-hook>
- Vite 8 release 与当前 Node.js compatibility note：<https://vite.dev/blog/announcing-vite8>、<https://vite.dev/guide/>
- Microsoft Edge extension compatibility：<https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/port-chrome-extension>
- Microsoft Edge extension API support：<https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/api-support>
- Microsoft Edge DevTools Protocol：<https://learn.microsoft.com/en-us/microsoft-edge/devtools/protocol/>
- Microsoft Edge Native Messaging：<https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/native-messaging>
- Playwright browsers/screenshots：<https://playwright.dev/docs/browsers>、<https://playwright.dev/docs/api/class-page>
- Chrome extension security/content scripts：<https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure>、<https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts>
- Chrome `activeTab` 与 `tabs.captureVisibleTab`：<https://developer.chrome.com/docs/extensions/develop/concepts/activeTab>、<https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab>
- Chrome extension storage/service workers：<https://developer.chrome.com/docs/extensions/reference/api/storage>、<https://developer.chrome.com/docs/extensions/develop/concepts/service-workers>
- Chrome Service Worker WebSocket lifecycle：<https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets>
- MCP tools/resources/cancellation：<https://modelcontextprotocol.io/specification/2025-11-25/server/tools>、<https://modelcontextprotocol.io/specification/2025-11-25/server/resources>、<https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/cancellation>
- MCP Tasks 演进与不兼容迁移：<https://modelcontextprotocol.io/seps/2663-tasks-extension>、<https://modelcontextprotocol.io/extensions/tasks/overview>
- MCP security best practices：<https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices>
- Node.js stream/backpressure：<https://nodejs.org/api/stream.html>
- Node.js releases/LTS 状态：<https://nodejs.org/en/about/previous-releases>
- Microsoft WSL 跨文件系统与项目位置建议：<https://learn.microsoft.com/windows/wsl/filesystems>

引入依赖前必须核对许可证并更新 `THIRD_PARTY_NOTICES.md`。AGPL 项目只作为行为和公开架构参考，除非项目明确接受相应许可证义务。
