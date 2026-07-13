# P0 Proof-of-Value 建议执行序列

> 文件名为兼容保留。“一周”和下表步骤不是期限、工时估算或并行授权；它们只表达依赖友好的执行顺序。Codex 可以缩短编码时间，但不能跳过真实环境、Edge、隔离评估与证据门禁。

## Outcome

当前 scope 的第一目标是形成可复核的投资结论：在通过预检的 Windows Edge + WSL ext4 环境中，用户选择 intrinsic JSX 元素后，VEM 的 bounded selection/source evidence 是否值得继续建设。完整 MCP+HMR walking skeleton、MV3 extension、截图和 Visual V1 不属于这个首轮 scope。

## 建议顺序

| 步骤 | 依次执行的原子任务 | 必须产出 | 结果型 stop condition |
|---|---|---|---|
| A0：只读迁移准备 | P0-T0A0 | staging Git/device/inode identity、baseline/dirty/untracked hash、目标/ext4/case/capacity readiness 与无目标写入证明 | source identity、payload 或 target readiness 不明确：不创建目标，先修计划 |
| A1：迁移与单写者切换 | P0-T0A1 → P0-T0A2 | owner-authorized layout commit、prefix-normalized parity、clean target、read-only rollback，以及 evidence schema/Node-pnpm decision | 未授权 commit、parent/parity/clean target/ext4 任一未证实：不切换写入者；已切换后不再写 staging |
| A2：环境 aggregate | P0-T0B → P0-T0C → P0-T0D → P0-T0E → P0-T0F | registry/watcher、direct Edge、Windows-WSL path、private ACL 与 aggregate preflight verdict | 任一 probe 或 T0F 未通过：只修环境并重跑 evidence |
| B：正式 Edge 工具链 | P0-T1 → P0-T0G → P0-T3 → P0-T4 | 固定 Node/pnpm/Playwright workspace、真实 `msedge` channel、protocol/privacy/confirmation schema、fixture | frozen install、Playwright Edge channel、schema 或 production fixture build 不通过 |
| C：selection→source | P0-T15 → P0-T16 → P0-T5 | dev-only intrinsic anchor、revision registry、bounded page-untrusted selection summary | production leak、错误 anchor、隐私字段出站或输出不可重复 |
| D：只读评估通道 | P0-T17A | 两层只读 harness 与 canonical JSON evidence bundle | harness 可写 source、bundle 不确定、ground truth 泄漏或 timing 不一致 |
| E：价值决策 | P0-T17B | 3–5 task immutable evidence 与显式 `decision` | wrong attribution、later-holdout 污染或 per-task cost 超过预登记边界 |

仍然一次只执行一个 task。每个 task 完成后立即运行目标测试并更新状态；不能通过合并后续任务、删除负例或放宽 security/privacy gate 追赶虚拟日程。

## Micro-pilot 最小隔离

- direct-search 与 VEM-assisted arm 分别使用全新的 Codex conversation/context；不得携带前一 arm 的答案或搜索路径。
- 同一 task 的 arm 顺序随机或交叉平衡；两个 arm 使用同一 prompt、fixture commit、工具权限、计时边界和 cache policy。
- ground truth 与 evaluator 记录在 trial 结束前对参与路径不可见。
- 一次性安装/registry 生成成本与每 task 成本分开记录。
- 3–5 task 只用于发现明显失败和决定是否继续，不用于统计百分比宣传。

## Stretch，仅在逻辑 `P0-VALUE` 当前 attempt 为 `continue` 后

按 P0-T7 → P0-T11 → P0-T12A → P0-T12B → P0-T12C 顺序尝试 bounded MCP read-only source-resolution smoke。`status: done, decision: adjust|stop` 不满足这个条件；adjust 只能在 remediation 后以新的 immutable attempt 重试，stop 使 P0 failed。任一 task 未完成都不能宣称该 smoke 存在；P0-T8 及之后的 prepared HMR verification 留给后续 scope。

## Scope cut

当前首轮明确不做：MV3 extension、pairing/token、screenshot/capture、style/layout/visual verification、durable artifact、remote/CDP、Chrome、framework adapters、public npm/store distribution。协议可以保留 seam，但 P0-T12A 的最小静态 CapabilityReport 必须为这些能力返回 unavailable。

## 环境准备

迁移和安装基线见 `docs/DESIGN.md` 的“3.1.1 已选 canonical root、迁移门禁与环境安装基线”。`/mnt/d/vem` 与 `/mnt/d/VEM` 先按 Git/device/inode 判定是否同一 staging；P0-T0A0 只读准备，P0-T0A1 在 owner 授权下建立 `/home/qwzx/src/VEM` 的扁平 layout commit 并切换为唯一写入者，旧树只读保留，P0-T0A2 再固定工具链/evidence schema。命令成功不代表 preflight passed，必须保存 P0-T0A0–F 的结构化 evidence；P0-T0G 再证明固定 Playwright 的真实 Edge channel。

## 首轮完成定义

- P0-T0F 为 done 且 aggregate verdict passed，P0-T0G 真实 `msedge` channel 通过；
- workspace、fixture、dev transform、registry、selector summary 和只读 harness 的目标测试通过；
- production build 无 VEM marker/client/endpoint/mapping；
- 3–5 task plan 在观察结果前登记，两个 arm 隔离，later holdout 未被使用；
- wrong source attribution 为 0；
- P0-T17B 为 `status: done` 并记录 `decision`。`continue` 授权 stretch；`adjust/stop` 也是有效、诚实的评估完成，但不授权后续任务。
