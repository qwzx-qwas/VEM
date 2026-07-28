# M16：安全、性能与产品指标

## 本块目标

把安全底线、性能预算和产品效果证据放在同一完成视角中。

## 权威来源

- `docs/DESIGN.md`：第十一、十六章
- Contracts：`PRIV-MIN-001`、`PROD-LEAK-001`、`FALLBACK-POLICY-001`、`REMOTE-SEC-001`、`CONTAINER-SEC-001`、`UX-GATE-001`

## 核心内容

默认是 development-only、本地 loopback 或受限 IPC。Remote 模式后续显式开启，并配合 HTTPS/WSS、auth expiry、authorization、rate limit 和 audit。Container/SSH 各有独立最小权限边界，不能把容器隔离当作替代 VEM 内部 trust/privacy contract。

性能重点不是单纯低延迟，而是 hover 本地化、小 summary、bounded queue、控制面不被截图阻塞和可测的 settle。产品指标同时关注 direct-primary exact、仅在 direct 不可用时的 degraded top-k、wrong attribution、target-changed reselection、安装到首次选择、edit 保留/撤销、uninstall residue、ambiguity correctness 和 zero false-positive `passed`。

安全性能采用“底线优化、增强项可控”的模型：身份/授权/schema/隐私/路径/replay/revision 等底线不可关闭，通过有界 payload、编译 validator、单次 redaction 和安全 cache 降低成本；额外交叉验证、只读主动复核、扩展诊断和本地审计默认开启，用户可从受信任配置逐项关闭，并承担清晰可见的 evidence/diagnostics limitation。

## 关键边界

- 安全底线不能通过 fallback 降级。
- 内部测试覆盖率不能替代用户路径和 holdout 证据。
- 更快但错误归因的路径不构成产品改善。
- 不提供全局安全关闭或 trusted-local 绕过；增强项 opt-out 不能提高 confidence、权限或通过率。

## 后续验收问题

1. 本地默认模式和 remote 模式的安全假设有何不同？
2. 为什么性能优化要区分不可关闭的安全底线和可逐项关闭的默认增强项？
3. 哪些产品指标能揭示“看似成功但改错对象”？
4. 为什么 false-positive `passed` 要求为零？

## 通过标准

能够把安全、性能和产品正确性作为相互约束的 gate，而不是三份独立清单。
