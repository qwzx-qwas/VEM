# M07：总体架构、拓扑与 Transport

## 本块目标

掌握浏览器、Vite、Coordinator 和 MCP consumer 之间的真实进程及连接边界。

## 权威来源

- `docs/DESIGN.md`：第五章
- Contract：`TOP-P0-001`

## 核心内容

长期架构包含页面 runtime、content script、extension service worker、Vite build integration、Coordinator 和 MCP adapter。P0 注入路径更窄：Codex 启动 MCP STDIO adapter 与 in-process coordinator；真实 Vite 进程通过用户私有 runtime discovery 找到它，并代理同源 `/__vem/browser`。

需要分开建模浏览器连接、build integration 连接和 MCP consumer 连接。页面 ingress 是不可信输入；source registry publication 使用独立 build capability；MCP consumer identity 从 transport connection 派生。

## 关键边界

- 测试进程内拼装不能替代真实 Vite/MCP OS-process 证据。
- 页面 ingress 不能获得 build registry 权限。
- project instance restart 后不能复用旧 discovery、session 或 revision identity。

## 后续验收问题

1. P0 中谁启动 Coordinator，谁启动 Vite？
2. 为什么页面 ingress 和 build-integration channel 要分开？
3. project instance 重启后，旧会话为什么不能继续使用？

1.
Vite dev-server process以 build-integration capability 连接 Coordinator
2.ingress是外部数据进入系统的入口，而build-integration channel是Vite 构建插件连接 Coordinator 的专用可信通道，二者肯定要分开啊
3.保证旧会话不会对新会话造成影响
## 通过标准

能够画出 P0 的进程与三条连接，并指出每条连接的身份来源和权限差异。
