# M23：原子任务与执行治理

## 本块目标

掌握 Codex 如何选择一个 eligible task、制定计划、记录中断和报告完成。

## 权威来源

- `AGENTS.md`
- `PLANS.md`
- `prompts/NEXT_TASK_PROMPT.md`
- `docs/tasks/ATOMIC_TASK_PROMPTS.md`
- `docs/checkpoints/README.md`

## 核心内容

一次只处理一个 eligible atomic task。eligible 同时要求 task dependency `done`、phase dependency `passed`、所需 logical decision current attempt 的 verdict 精确满足，以及所需 capability seam 已存在或就在本 task 内交付。

计划使用 `PLANS.md`，明确 observable goal、contracts、capability、trust、lifecycle、tests、commands、done conditions 和 stop conditions。任务通过后更新 `ROADMAP.yaml` 和 `docs/progress.md`。中断时只写 `docs/checkpoints/<TASK-ID>.md`，不在 prompt 下建立第二状态源。

任务默认以一个可独立观察、可回滚的结果为单位；如果跨越多个 authority、persistent-state、protocol surface 或 failure domain，先拆 roadmap task。

## 关键边界

- `done` 不等于 decision `continue`。
- 测试失败时修复、保持 `in_progress`，或仅在外部 blocker 有证据时标记 `blocked`。
- checkpoint 记录续接位置，不表示 task 完成。
- 不把相邻 phase 能力顺带塞入当前 task。

## 后续验收问题

1. 一个 task 成为 eligible 要同时满足哪些条件？
2. 什么迹象说明一个 task 仍然太大？
3. 测试失败、外部阻塞和预算中断分别怎样记录？
4. 完成报告要提供哪些证据类别？

## 通过标准

能够独立选择下一 task，并不会通过 prompt 标记、宽松测试或相邻实现绕过 roadmap gate。
