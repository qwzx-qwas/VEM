# M01：文档权威与当前状态

## 本块目标

建立“哪个文件回答什么问题”的基本地图，并分清设计完成、任务完成和产品验证通过。

## 权威来源

- `docs/DESIGN.md`：§0 文档地位与阅读方式
- `AGENTS.md`：Required reading order、Status model
- `ROADMAP.yaml`：状态和 decision attempt
- `docs/STATUS.md`：人类可读快照

## 核心内容

VEM 当前是 pre-implementation design baseline。`docs/DESIGN.md` 是完整设计入口，`docs/requirements.yaml` 是 contract 索引，`ROADMAP.yaml` 是 task/phase/decision 状态源。`docs/progress.md` 只保存实现证据，`docs/history/` 保存设计演进。

三个容易混淆的“完成”彼此独立：task `done` 表示该原子工作通过检查；decision `continue` 表示证据允许继续投资；phase `passed` 表示阶段 gate 整体通过。设计文档写得完整不代表任何一个状态已经通过。

## 关键边界

- 学习摘要不是规范来源。
- `progress.md` 不是状态数据库。
- decision task 完成后得到 `adjust` 或 `stop`，仍不授权下游工作。

## 后续验收问题

1. 需要判断“下一步能否执行”时，你会依次看哪些文件？
2. `done`、`continue`、`passed` 分别证明了什么？
3. 当前项目最准确的一句话状态是什么？

1.`docs/STATUS.md``docs/DESIGN.md``AGENTS.md``ROADMAP.yaml`
2.done:能执行 continue：在执行 pass：已执行
3.写好文档架构但没开始执行

## 通过标准

能够指出唯一状态源，并且不会把设计 baseline 或评估执行成功误当作产品 gate 通过。
