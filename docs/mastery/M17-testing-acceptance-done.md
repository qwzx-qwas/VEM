# M17：测试、验收与完成定义

## 本块目标

理解测试层级、fixture、关键验收场景和产品完成定义如何共同约束交付。

## 权威来源

- `docs/DESIGN.md`：第十七章、第二十二章、附录 A
- Contract：`TEST-GATE-001` 及各领域 contract

## 核心内容

测试体系包含 unit、integration、contract、security、reliability/data lifecycle、performance 和 E2E。Playwright Chromium 提供快速反馈，Edge Stable 是对应 release gate。Fixture 覆盖 nested DOM、循环实例、共享组件、恶意 payload、stale revision、并发 consumer、capture race 和 production leakage。

`TEST-GATE-001` 是通用测试与追踪 contract，不单独替代领域 contract。实现 privacy、selection、verification 或 lifecycle 行为的 task，要绑定对应领域 contract 和负例。产品完成还要求安装、真实浏览器路径、数据删除、可见 degradation、浏览器 ACK、主观 review 和生产无泄漏。

## 关键边界

- 测试命令通过不自动满足产品 evidence gate。
- 失败测试不能通过删除、跳过或放宽断言制造成功。
- E2E 进程内 mock 不能替代明确要求的真实 OS-process 路径。

## 后续验收问题

1. Contract test、security test 和 E2E 各证明什么？
2. 为什么 `TEST-GATE-001` 不能成为领域行为的唯一 contract？
3. 哪些关键场景专门防止 false-positive success？
4. “项目完成”还包含哪些非功能性证据？

## 通过标准

能够从 requirement 指向适当测试层，并区分内部 pass 与产品 gate。
