# M13：Capability、Fallback 与源码构建

## 本块目标

理解如何诚实报告 provider 能力，以及 source anchor、registry、heuristic 与 production stripping 的关系。

## 权威来源

- `docs/DESIGN.md`：第十一、十二章
- Contracts：`FALLBACK-POLICY-001`、`REV-ID-001`、`EVIDENCE-TRUST-001`、`PROD-LEAK-001`

## 核心内容

CapabilityReport 描述当前 provider 真正可用的能力、限制和 degradation。fallback 有 strict、balanced、compatibility 三种策略，但 provider 变化要显式报告，不能从认证路径降级到未认证路径，也不能用 stale evidence 完成 verification。

FallbackPolicy 不是安全总开关。安全底线始终执行；额外 evidence corroboration、只读主动 freshness revalidation、扩展 diagnostics 和本地 audit metadata 作为默认开启的增强项，才允许用户通过受信任的 project/profile 配置逐项关闭。关闭项必须显示 limitation，不能提升 confidence、扩大权限或让 verification 更容易通过。

开发期 Vite transform 为 intrinsic JSX 注入 source anchor，并发布 revision-scoped registry。anchor 在源码编辑后可能迁移，需要 signature 和 migration evidence；映射候选按证据等级表达。生产构建不携带生成 client、endpoint、marker 或 mapping，用户自己的同名属性也不能被误删。

## 关键边界

- heuristic 只能是候选。
- capability 出现在设计中不表示当前 provider 支持。
- production leakage gate 和用户属性保留要同时验证。
- `compatibility` 也没有 `security: off`；“可信本机”不能跳过接收层校验。

## 后续验收问题

1. strict、balanced、compatibility 的差别主要体现在哪里？
2. 哪些安全底线永远不能 fallback，哪些默认开启增强项可以逐项关闭？
3. source anchor 为什么要带 revision 和 migration evidence？
4. production stripping 要同时防止哪两种错误？

1.strict：只接受高可信能力。例如扩展或高可信 source anchor 不可用，就直接失败。
balanced：允许换成能力稍弱但仍有结构化证据的 provider。例如从 Edge Extension 降级到 Vite 注入，但必须明确报告截图能力、浏览器身份可信度等损失。
compatibility：为了兼容更多环境，可以使用 DOM clue、文本搜索、heuristic candidate，但只能报告为低可信候选，不能冒充精确定位。
2.有关隐私和直面用户安全的不能fallback
3.revision:防止把修改前后的不同页面错误地当成同一状态；
证明本次页面变化来自刚才那次源码修改；
HMR 后继续追踪原先选择的目标；
防止旧页面拿新 registry 做错误映
migration evidence:简单点，没必要上候选，最多在内部搞一下就行
4.已重构


## 通过标准

能够解释诚实 degradation、证据等级和开发/生产构建分离。
