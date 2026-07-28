# M05：浏览器策略与 Edge Preflight

## 本块目标

掌握为什么 Edge Stable 是 Tier-1 gate，以及开始产品实现前要证明哪些真实环境条件。

## 权威来源

- `docs/DESIGN.md`：第三章
- Contract：`EDGE-PREFLIGHT-001`、`BROWSER-MODE-001`
- `ROADMAP.yaml`：P0-T0A0–P0-T0G

## 核心内容

Edge Stable on Windows 是发布 gate；Playwright Chromium 是快速 CI 浏览器；Chrome 是兼容目标。三种运行模式分别是 Vite 注入、Edge MV3 扩展和可选 Edge CDP/Playwright，它们的信任与能力不同。

Preflight 不只是找到 `msedge.exe`。它覆盖 staging/target 身份、ext4、固定 Node/pnpm/Playwright、registry/proxy/CA、watcher/HMR、真实 Edge direct 与 channel launch、Windows–WSL HTTP/WebSocket、loopback 隔离、private runtime ACL、两个真实 OS process 和 restart 行为。

## 关键边界

- Linux Chromium 通过不能冒充 Windows Edge gate。
- `/mnt/d/vem` 与 `/mnt/d/VEM` 不能仅凭字符串当作两份仓库。
- P0-T0A0 是只读盘点；迁移 commit 和 cutover 需要后续独立授权。

## 后续验收问题

1. Edge Stable、Playwright Chromium 和 Chrome 各自承担什么角色？
2. 为什么“Edge 可执行文件存在”不是 preflight 通过？
3. P0-T0A0 与 P0-T0A1 的权限边界是什么？
4. 三种浏览器模式中，哪一种是日常可信路径？

1.Edge Stable：主要支持对象，也是正式发布前必须通过的真实环境。
Playwright Chromium：运行速度快，用于日常 CI 和跨平台自动测试。
Chrome Stable：用于兼容性回归，检查面向 Edge 开发的功能在 Chrome 中是否也正常。
2.因为还有其他方面要验证
3.P0-T0A0：只读盘点
P0-T0A1：获得所有者明确授权后执行迁移
4.Edge MV3 扩展模式
## 通过标准

能够列出 Tier-1 环境的关键证据，并区分只读 readiness 与迁移授权。
