# VEM 文档地图

本页是文档导航，不是新的规范事实来源。现阶段完整规范正文仍保留在 `docs/DESIGN.md`；在 P0-T2 的追踪验证器支持多文件 `path + stable anchor` 引用前，不进行破坏 `docs/requirements.yaml` 精确标题映射的大规模搬迁。

## 文档类别

| 类别 | 作用 | 当前入口 | 状态来源 |
|---|---|---|---|
| 规范与边界 | 描述产品、架构、安全、协议和验收行为 | `docs/DESIGN.md`、`docs/requirements.yaml` | `docs/DESIGN.md` 正文与后续 accepted ADR/specification |
| 决策 | 保存待 owner 决定事项和已接受设计选择 | `docs/decisions/OPEN_DECISIONS.yaml`、未来 `docs/adr/` | accepted ADR；开放清单只做导航 |
| 计划 | 表达阶段、依赖、任务和 gate | `ROADMAP.yaml`、`docs/delivery/P0_PROOF_OF_VALUE.md` | `ROADMAP.yaml` |
| 执行治理 | 约束 Codex 如何选取、计划和完成任务 | `AGENTS.md`、`PLANS.md`、`prompts/`、`docs/tasks/` | `AGENTS.md` 与 `ROADMAP.yaml` |
| 当前状态 | 给人快速查看当前阶段、阻塞和下一任务 | `docs/STATUS.md`、`docs/progress.md` | task/phase/decision 仍以 `ROADMAP.yaml` 为准 |
| 证据与历史 | 保存实现证据、测试结果和设计变更历史 | `docs/test-evidence/`、`docs/history/` | 原始 evidence 与 Git 历史 |
| 学习与验收 | 将项目拆成小块用于 owner 问答掌握 | `docs/mastery/README.md` | 非规范性学习材料，冲突时回到权威来源 |

## 推荐阅读路径

### 项目掌握

从 `docs/mastery/README.md` 开始。每次只学习和验收一个块，不要求先通读 2,390 行设计正文。

### 实施任务

遵循 `AGENTS.md` 的 required reading order。`docs/mastery/` 不能替代任务实施所需的完整规范、contract 和 roadmap 检查。

### 快速查看当前状态

先读 `docs/STATUS.md`，再以 `ROADMAP.yaml` 核对机器可读状态；已完成任务的证据记录在 `docs/progress.md`。

## 渐进重分类边界

本轮只建立导航、状态、历史、开放决策、交付和掌握目录，并消除重复状态源。后续物理拆分规范正文时采用以下顺序：

1. P0-T2 先让 requirements schema/validator 支持多文件 `path + stable anchor`；
2. 每次只抽取一个 contract 的权威正文；
3. 同步更新 contract source、内部链接和验证 fixture；
4. `docs/DESIGN.md` 保留产品总览、跨规范导航和兼容锚点；
5. 通过追踪验证后再抽取下一个 contract。

这样可以避免一次性移动标题后使现有 25 个 contract 的映射失真。
