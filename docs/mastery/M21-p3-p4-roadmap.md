# M21：P3–P4 路线

## 本块目标

理解真实视觉证据首次出现在哪一阶段，以及 Visual Beta 与 Visual V1 的差距。

## 权威来源

- `ROADMAP.yaml`：P3、P4
- `docs/DESIGN.md`：§2.5、第十九章

## 核心内容

P3 先建立 style/layout context、memory-first binary resource 和隔离 upload lane，再实现 consented capture epoch、Edge activeTab capture、本地 mask/crop、真实像素与几何验证。随后补齐 priority queue、ACK/reconnect、diagnostics、fresh cache、fallback 和至少 50 task visual corpus，最后运行独立 visual verdict。

P4 增加高级 StyleEvidence、复合 intent hints、accessibility/responsive/style/overflow assertions、字体/动画/caret 稳定化和 subjective `needs-review`。Visual V1 gate 包含 Edge 环境矩阵、全新 project/profile 的 install→pair→visual task→revoke/uninstall 旅程以及独立 holdout 的 zero false-positive verdict。

## 关键边界

- 第一张真实截图之前已有最小 binary backpressure 和生命周期保护。
- P3 capture 默认不是 durable artifact。
- 主观视觉要求即使在 P4 也不自动变成客观 passed。

## 后续验收问题

1. 为什么 P3 要先建立 binary lane 再执行 capture？
2. Visual Beta 到 Visual V1 增加了哪些稳定性和发布证据？
3. 哪些资源能力仍要等到 P6？
4. 主观任务在 P4 怎样结束？

## 通过标准

能够说明真实视觉垂直切片的安全顺序和 P4 release gate。
