# M20：P1–P2 路线

## 本块目标

理解 Injected MVP 和 Trusted Preview 分别加固什么，而不是把 P2 当作对 P0 的重写。

## 权威来源

- `ROADMAP.yaml`：P1、P2
- `docs/DESIGN.md`：§2.5、第十九章

## 核心内容

P1 加固 P0 已有注入闭环：selector/overlay、direct/transaction-matched target reattachment、target-changed reselection、registry、ContextRequest、consumer claim、MCP compatibility、HMR 状态、text verification、恶意 fixture，以及开发平面隔离/生产不参与门禁。它还交付 injected-preview CLI、配置生成、升级/rollback、clean uninstall，并在至少三个 held-out React Vite 项目上运行 no-VEM baseline pilot。

P2 引入 Edge MV3 trusted path：共享 extension、content script/page adapter、pairing bootstrap/challenge/bearer、popup/revoke、sender-derived identity、authenticated browser channel、local transports、sideload packaging、upgrade/uninstall 和 fresh-profile evidence verdict。

## 关键边界

- P1 是加固既有 EvidenceGraph，不是首次补上 source evidence。
- P2 scoped bearer 不被描述为 proof-of-possession。
- Container、SSH、remote、CDP 和商店发布仍不在 P2。

## 后续验收问题

1. P1 相比 P0 的主要产品提升是什么？
2. P2 的“trusted”主要来自哪些浏览器和 pairing 边界？
3. 为什么 P1/P2 都包含 install/upgrade/uninstall 证据？
4. 哪些能力仍明确留给后期？

## 通过标准

能够按“注入路径加固”与“可信扩展路径”区分两个阶段。
