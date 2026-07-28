# M22：P5–P8 路线

## 本块目标

用 outcome 级理解远期能力，不把远期 task 误认为已承诺的当前实现。

## 权威来源

- `ROADMAP.yaml`：P5–P8
- `docs/DESIGN.md`：§2.5、第十九章

## 核心内容

P5 处理完整 runtime owner evidence、list key、usage candidate、shared impact、多选和 partial result。P6 引入 behavior/diagnostic correlation、reference image、page root/region，并在实际需要时升级为 durable artifact、tombstone 和 orphan cleanup。P6 的持久库默认位于每用户应用数据目录，支持经受信任本机配置和 capability probe 的自定义 artifact root；用户可 copy-import 静态参考图并在导入前预览、mask/crop，再以非授权 `VisualReferenceBinding` 绑定 immutable target 和源码候选证据。active 参考任务支持多轮 refinement 和用户 pause/resume/complete/cancel/replace/renew，指导期限与图片保留期限分离；linked external file 与远程 URL 导入仍是未交付能力。

P7 增加可选 Edge CDP、容器、SSH、HTTPS/WSS remote、Chrome compatibility 和 npm/plugin/Edge/Chrome 商店分发。P8 评估 Vue、Next.js、Svelte 和 Astro adapter，并继续保持 protocol、privacy、verification 和 production-leakage contract。

## 关键边界

- shared definition 影响未知时不自动修改全部 usage。
- container/remote 是额外 transport，不能降低内部 trust/security floor。
- framework adapter 复用 contract，不创建宽松的第二套安全模型。
- 这些阶段仍是 backlog，可能受前序 evidence gate 调整或停止。
- 用户导入不是浏览器自动截图：它不运行 active-tab/capture-epoch 检查，但仍受有界解码、metadata 清除、ownership、TTL、quota 和 opaque URI 约束。
- 未绑定图不声称源码关系；视觉绑定不能替代 claim、ConfirmationBinding、source proof 或 verification。

## 后续验收问题

1. P5 与 P6 分别解决哪两类高级用户任务？
2. durable artifact 为什么到 P6 才引入？
3. P6 如何区分自动 capture、copy-on-import 和尚不可用的 link mode？
4. 为什么视觉参考绑定、编辑授权和 artifact 保留要分开？
5. P7 的四类分发 surface 是什么？
6. 多框架适配要继承哪些核心不变量？

## 通过标准

能够用能力结果概括 P5–P8，并保持“backlog 不是当前承诺”的认识。
