# M04：产品证据、许可证与 P0 Scope

## 本块目标

理解为什么内部测试通过仍不足以授权继续，以及 owner 在开始实施前有哪些真实决策。

## 权威来源

- `docs/DESIGN.md`：§2.7–2.9
- `docs/delivery/P0_PROOF_OF_VALUE.md`
- `docs/decisions/OPEN_DECISIONS.yaml`
- Contracts：`UX-GATE-001`、`LICENSE-POLICY-001`

## 核心内容

P0 value micro-pilot 使用 3–5 个预登记窄任务，对比 direct-search 与 VEM-assisted 两条路径。两组使用隔离 Codex context、相同 prompt 和计时边界，ground truth 对参与路径隐藏。wrong attribution、输入 hash 变化或 later holdout 被污染会使 verdict 失去授权力。

许可证目前仍是 owner 决策。设计推荐 Apache-2.0，但在 `LICENSE`、版权主体、贡献政策和发布边界被确认前，项目事实仍是 private/unlicensed。当前首轮只做 proof-of-value，不做扩展、截图、远程、商店或多框架。

## 关键边界

- 3–5 个任务是 engineering smoke，不支持统计性产品宣传。
- 评估 task `done` 可以对应 `continue`、`adjust` 或 `stop`。
- 设计推荐不是 owner 已接受的许可证决定。

## 后续验收问题

1. micro-pilot 为什么要在 coordinator/HMR 大规模建设之前运行？
2. 哪些情况会让 pilot 结果不能授权继续？
3. 许可证未决定时，哪些工作仍可进行，哪些发布工作应停留？
4. 当前首轮明确排除了哪些能力？


1.看是否有价值
2.系统把元素错误地归到某段源码；
测试过程中输入的 hash 发生变化；
提前使用未来的 holdout 样本进行调参；
两组测试使用了不同提示词、权限或计时规则；
标准答案提前泄露给 Codex；
看到结果后才降低通过标准。
3.已经有license
4.不做：Edge MV3 浏览器扩展；
配对和令牌；
截图、像素、样式和布局验证；
长期保存产物；
远程控制和 CDP；
Chrome 适配；
多框架适配；
npm 或扩展商店公开发布
## 通过标准

能够解释 value gate 的实验隔离、三种 verdict 和当前许可证事实。
