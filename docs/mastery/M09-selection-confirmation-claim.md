# M09：选择、视觉参考、确认与 Claim

## 本块目标

区分页面选择、视觉参考绑定、用户授权、immutable claim 和 verification prepare。

## 权威来源

- `docs/DESIGN.md`：第七章、第二十章
- Contracts：`SEL-PROV-001`、`CONF-BIND-001`、`VISUAL-BIND-001`

## 核心内容

注入页面中的点击最多生成 page-untrusted selection evidence，不自动证明可信用户手势。选择先锁定 immutable snapshot；严格编辑流程还要有可见 prompt 或外部 confirmation binding。MCP consumer claim 绑定这一快照，使后续流程不随 mutable active selection 漂移。

`ConfirmationBinding` 绑定 selection hash，以及 direct source evidence 或明确降级的 candidate set/hash，再绑定最小 action allowlist、consumer/project/document/revision、TTL 和 integrity provider。prepare 对它执行原子 reserve/consume，因此并发调用最多一个成功。

P6 的 `VisualReferenceBinding` 解决另一件事：把参考图绑定到 immutable selection/region/page-root target 和当时的 direct-primary/related evidence，或 direct 不可用时明确降级的 candidate evidence，使它在同一 reference task 的多轮修改中继续作为视觉目标。它不是 consent，也不允许写源码；每次修改仍要取得 claim、一次性 `ConfirmationBinding` 并 prepare verification。

## 关键边界

- claim 解决并发归属，不等于用户授权。
- VisualReferenceBinding 解决“这张图指导哪个目标”，不等于用户授权、源码正确性或验证通过。
- active selection 是可变便利状态，不适合作为自动编辑目标。
- prepare 前 source/action/project/document 变化后，旧 confirmation 失效；prepare 后由本次相关 update transaction 唯一证明的 successor 只继承 verification 边界，不授权第二次编辑。

## 后续验收问题

1. selection、visual reference binding、claim 和 confirmation 各自解决什么问题？
2. 为什么注入模式的 click 仍被视为 page-untrusted？
3. prepare 并发消费同一个 confirmation 时应发生什么？
4. 哪些变化会使绑定失效？

1.selection 页面上选中哪个元素，claim 某个 MCP/Codex 任务对这份快照取得的短期工作权， confirmation 用户明确同意继续
2.还是安全性考虑
3.只能有一个成功
4.目标元素或选择快照发生变化；
页面导航、刷新，导致 documentId 或页面代次变化；
prepare 前源码主定位、源码注册表版本或 degraded 候选集合发生变化；
项目或 Coordinator 实例重启；
MCP 连接或 consumer 身份变化；
claim 被释放、过期或连接断开；
实际动作不在用户确认的允许列表中；
confirmation 超过 TTL；
confirmation 已经被使用。

prepare 消费之后发生的预期源码/HMR revision 变化不重新消费 confirmation；complete 必须得到 direct 或 transaction-matched reattachment。无法唯一证明时返回 `target-changed/ambiguous` 并重新选择，不能复用旧 confirmation。

## 通过标准

能够说明从页面选择到可编辑目标的完整授权链，不把 claim 当 consent。
