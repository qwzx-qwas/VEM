# M15：HMR 与两阶段验证

## 本块目标

理解为什么 verification 要在编辑前 prepare，并如何证明某次 HMR 与目标源码相关。

## 权威来源

- `docs/DESIGN.md`：§13.4、第十五章
- Contracts：`VER-TXN-001`、`OBS-FRESH-001`

## 核心内容

prepare 在编辑前原子保存 before Observation、RevisionContext、固定 target module/dependency scope 和 journal cursor。源码编辑及测试之后，Coordinator 从 barrier 后回放 update journal，只把与 source registry/Vite module graph 交集匹配的更新视为 relevant batch；无关 HMR 被忽略。当前 marker 可直接解析时使用 direct reattachment；DOM/anchor 改变时，相关 update transaction 先证明更新因果范围，before/after runtime target fingerprint 或可用 framework key 再唯一重新附着目标，最后由新 DOM marker 与当前 registry 直接映射 successor source，三者齐全才是 transaction-matched。相关与竞争更新或运行时目标无法消歧时返回 `target-changed/ambiguous` 并重新选择。

complete 等待 browser receipt 和 DOM settle，再进行 fresh reattach 与 VerificationSpec 断言。文本、几何、overflow 等客观条件可以自动判定；“更现代”等主观条件返回 capture 与 `needs-review`。

## 关键边界

- 编辑后才采集的页面不能冒充 before Observation。
- 只看到 HMR revision 增加不能证明目标更新已应用。
- tests fail 时不进入成功 complete。

## 后续验收问题

1. prepare 在源码修改前固定哪些信息？
2. 无关文件 HMR 为什么不能满足 verification？
3. 相关与无关更新交错时怎样保持可解释性？
4. 哪些断言可以自动 passed，哪些需要 review？

## 通过标准

能够完整复述 prepare → edit/test → journal match → settle → complete 的因果链。
