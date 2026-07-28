# M06：对象、身份与证据图

## 本块目标

理解为什么像素、DOM、组件和源码不能使用同一个 ID，也不能假定一一对应。

## 权威来源

- `docs/DESIGN.md`：第四章
- Contracts：`REV-ID-001`、`EVIDENCE-TRUST-001`

## 核心内容

一个视觉对象可能来自嵌套 DOM、多层组件、共享组件、循环实例、条件分支和父容器样式。相同 source anchor 可以产生多个 runtime instance；同一 runtime 目标也可能受多个源码位置影响。

设计拆分 project、project instance、source revision、browser session、document generation、runtime node、source anchor 和 reattach fingerprint。当前 DOM marker 与同 revision registry 匹配时，`hostAnchor` 是直接主定位；owner、usage、style 和 layout 仍组成带 provenance、confidence、freshness、conflict 和 limitation 的证据图。只有 direct 不可用时才返回 degraded heuristic candidates，不能把所有结果都做成要求用户猜选的排行榜。

## 关键边界

- registry membership 证明 marker 属于某次构建，不单独证明当前 DOM 就对应该源码。
- heuristic candidate 不能描述为 exact。
- prepared verification 只接受当前 direct anchor 或由相关 update transaction 唯一证明的 successor；不确定时返回 `target-changed` 并重新选择，相似 alternatives 只作诊断。
- shared impact 无法确定时保留 unknown。

## 后续验收问题

1. 为什么 `.map()` 里的多个按钮不能只靠 source anchor 区分？
2. source anchor 与 runtime node identity 分别回答什么问题？
3. EvidenceGraph 遇到冲突证据时应怎样表达？

1.因为这些按钮是由一处JSX循环生成，他们对应相同的源码
2.source anchor: 这个元素对应哪处源码
runtime node identity：用户具体选中了哪个DOM元素
3.保留冲突
## 通过标准

能够解释直接主定位与多来源证据图的区别，并拒绝用单一 ID、单一启发式候选或相似重附着 alternative 冒充事实。
