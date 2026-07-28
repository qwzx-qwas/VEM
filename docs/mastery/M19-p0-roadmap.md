# M19：P0 Proof-of-Value 路线

## 本块目标

理解当前唯一可执行入口，以及从环境证据到 value verdict 的依赖链。

## 权威来源

- `ROADMAP.yaml`：P0
- `docs/delivery/P0_PROOF_OF_VALUE.md`
- `docs/STATUS.md`

## 核心内容

当前唯一无依赖 task 是 P0-T0A0：只读冻结 staging identity、baseline、dirty/untracked payload、target readiness、case/capacity 和迁移计划。P0-T0A1 才在 owner 授权后执行 layout commit 和 single-writer cutover；A2–F 建立工具链、filesystem、Edge、Windows/WSL、ACL 和 aggregate preflight evidence。

正式 workspace 和 Edge channel 通过后，P0-T3/T4 建立协议与 fixture；P0-T15/T16/T5 形成 intrinsic JSX anchor、registry 和 bounded selection summary；P0-T17A/B 用只读 bundle 执行 3–5 task value micro-pilot。只有 `P0-VALUE: continue` 才授权 topology 与 verification stretch。

## 关键边界

- 本次文档重分类不是 P0-T0A0 完成证据。
- T17B `done + adjust/stop` 不授权 T7。
- 当前 proof-of-value 不承诺 MV3、capture、visual verification 或 distribution。

## 后续验收问题

1. 当前为什么只能从 P0-T0A0 开始？
2. 哪一步需要 owner 对 layout commit 的明确授权？
3. selection→source 的最小 value path 由哪些 task 构成？
4. 什么 verdict 才能进入 topology stretch？

## 通过标准

能够按依赖讲出 A0 到 value verdict，并准确指出权限与 stop condition。
