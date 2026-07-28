# VEM 项目掌握与问答验收

本目录把项目分成 23 个小块，供项目所有者逐块掌握。这里的内容是非规范性学习摘要；若摘要与 `docs/DESIGN.md`、accepted ADR、公开协议规范或 `ROADMAP.yaml` 冲突，以权威来源为准。

## 使用方式

1. 每轮只进入一个块。
2. Codex 一次只提出一个问题，每块通常 3–4 题。
3. 问题依次覆盖目标、边界、失败条件和 owner 决策。
4. 每块结束时输出“通过 / 部分通过 / 待澄清”、纠正点和开放决策。
5. 未通过的块停留在当前块，不因为阅读过正文而自动通过。

建议单块控制在 10–20 分钟。M01–M19 是 P0 前的核心掌握路径；M20–M23 可以在理解当前 proof-of-value 后继续。

## 分块索引

| ID | 主题 | 建议顺序 |
|---|---|---|
| [M01](M01-document-authority-current-state.md) | 文档权威与当前状态 | 核心 |
| [M02](M02-user-problem-boundaries.md) | 用户问题、使命与职责边界 | 核心 |
| [M03](M03-success-milestones-install.md) | 成功标准、里程碑与安装能力 | 核心 |
| [M04](M04-evidence-license-p0-scope.md) | 产品证据、许可证与 P0 scope | 核心 |
| [M05](M05-browser-preflight.md) | 浏览器策略与 Edge preflight | 核心 |
| [M06](M06-object-identity-evidence.md) | 对象、身份与证据图 | 核心 |
| [M07](M07-topology-transport.md) | 总体架构、拓扑与 transport | 核心 |
| [M08](M08-trust-token-pairing.md) | 信任、token 与 pairing | 核心 |
| [M09](M09-selection-confirmation-claim.md) | 选择、视觉参考、确认与 claim | 核心 |
| [M10](M10-context-privacy.md) | 按需上下文与隐私 | 核心 |
| [M11](M11-pipeline-freshness.md) | 数据管道、缓存与新鲜度 | 核心 |
| [M12](M12-capture-lifecycle.md) | 截图、参考绑定与数据生命周期 | 核心 |
| [M13](M13-capability-source-build.md) | Capability、fallback 与源码构建 | 核心 |
| [M14](M14-protocol-mcp-errors.md) | 协议、MCP surface 与错误 | 核心 |
| [M15](M15-hmr-verification.md) | HMR 与两阶段验证 | 核心 |
| [M16](M16-security-performance-metrics.md) | 安全、性能与产品指标 | 核心 |
| [M17](M17-testing-acceptance-done.md) | 测试、验收与完成定义 | 核心 |
| [M18](M18-contract-traceability.md) | Contract 与双向追踪 | 核心 |
| [M19](M19-p0-roadmap.md) | P0 proof-of-value 路线 | 核心 |
| [M20](M20-p1-p2-roadmap.md) | P1–P2 路线 | 后续 |
| [M21](M21-p3-p4-roadmap.md) | P3–P4 路线 | 后续 |
| [M22](M22-p5-p8-roadmap.md) | P5–P8 路线 | 后续 |
| [M23](M23-execution-governance.md) | 原子任务与执行治理 | 后续 |

## 单块验收记录

问答结果不直接改写规范或 roadmap。若回答产生了真实 owner 决策，先记录到 `docs/decisions/OPEN_DECISIONS.yaml`；接受的架构决策再进入 ADR，产品 gate verdict 仍由 `ROADMAP.yaml` 的 immutable attempt 保存。
