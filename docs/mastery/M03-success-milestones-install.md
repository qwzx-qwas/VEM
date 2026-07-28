# M03：成功标准、里程碑与安装能力

## 本块目标

区分 P0 walking skeleton、Injected MVP、Trusted Preview、Visual Beta 和 Visual V1。

## 权威来源

- `docs/DESIGN.md`：§2.4–2.6
- Contract：`UX-GATE-001`

## 核心内容

P0 的完整 walking skeleton 是 Edge 中选择 intrinsic JSX 元素、获得源码证据、由 Codex 修改源码、经过相关 HMR 和 fresh observation 完成文本验证，并证明生产构建无 VEM 泄漏。当前首轮 proof-of-value 比这一完整 P0 gate 更窄，只先回答 selection/source evidence 是否值得继续投资。

P1 加固注入路径并提供可安装/卸载的开发者体验；P2 引入可信 Edge MV3 和 pairing；P3 首次提供真实像素、样式和几何垂直切片；P4 才是 Visual V1。安装、升级和卸载从 P1/P2 就是产品能力，不能拖到 P7 商店分发才解决。

## 关键边界

- 出现在协议中的未来 seam 不等于 capability 已可用。
- 注入路径不等于零安装，项目仍需集成。
- P4 Visual V1 不包含后续多选、参考图、远程或多框架能力。

## 后续验收问题

1. P0 walking skeleton 与当前更窄的 proof-of-value 有什么差别？
2. 为什么 clean uninstall 被视为产品能力而不只是运维细节？
3. 什么条件满足后才可以把产品称为 Visual V1？


1.前者验证最小工作流的跑通，后者是实践
2.用户需要能放心使用
3.能在新环境，edge中完成安装，能完成视觉修改，能处理像素样式等几何信息，工作流稳定，删除干净

## 通过标准

能够把五个主要里程碑按能力边界排列，并避免提前宣传未来能力。
