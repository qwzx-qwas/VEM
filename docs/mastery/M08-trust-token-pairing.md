# M08：信任、Token 与 Pairing

## 本块目标

理解页面、content script、service worker 和 coordinator 的分层信任，以及 P2 pairing 为什么不能只靠发现端点。

## 权威来源

- `docs/DESIGN.md`：第六、十一章
- Contracts：`EVIDENCE-TRUST-001`、`SEC-PAIR-001`、`FALLBACK-POLICY-001`

## 核心内容

Page Runtime Adapter 永远是不可信证据源，也不接收 token。Content Script 可以独立观察 DOM，但输入输出仍按外部证据处理。Service Worker 持有短期 scoped bearer，依据 sender 派生 tab/frame/document identity；Coordinator 再次验证 auth、connection binding、project、revision、schema、quota 和 semantic conflict。

每个接收层的基础校验都属于不可关闭的安全底线。“本机、单用户、可信项目”不会把页面或跨进程输入升级为可信，也不能用来跳过 Service Worker 或 Coordinator 的复核。后续允许用户逐项关闭的是默认开启的增强证据、只读主动新鲜度复核、扩展诊断或本地审计，不是身份、授权、隐私和输入校验。

P2 pairing 在签发 bearer 前包含用户确认、终端一次性 bootstrap code 的原子消费和 challenge。bearer 即使有 scope 和 connection binding，仍是可转移凭证，不被描述为 proof-of-possession。

## 关键边界

- 低信任层不能声明高信任 identity。
- 页面可见的 discovery hint 不是 pairing authorization。
- 浏览器重启或扩展更新后需要新 token，不静默恢复旧 bearer。
- 不存在全局 `security: off` 或 `trusted-local bypass`；增强项关闭后只会减少证据/诊断并显示 limitation。

## 后续验收问题

1. 哪一层持有 token，页面为什么不能接触它？
2. Service Worker 和 Coordinator 为什么都要验证？
3. bootstrap code、challenge 和 bearer 分别解决什么问题？
4. scoped bearer 为什么仍不是 proof-of-possession？

1.危险
2.负责权限不同
3.
bootstrap code：证明配对者能够接触可信本机终端，而且只能使用一次。
challenge：证明这是当前正在进行的、新鲜配对请求，防止重放以前的请求。
bearer token：配对成功后，为正常通信提供短期、有限权限的访问凭证。
4.scoped bearer是谁复制到了 token，谁就可能在有效期和允许范围内使用它。
proof-of-possession 通常要求客户端持有一把不可导出的私钥，并对服务端每次生成的新 challenge 签名。攻击者只复制普通 token，没有私钥也无法通过验证。
## 通过标准

能够按层说明信任、身份派生和 credential 风险，不把页面 claim 洗成可信事实。
