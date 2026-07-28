# M12：截图、参考绑定与数据生命周期

## 本块目标

掌握自动截图竞态、用户外部导入、视觉参考绑定，以及 ephemeral、control metadata、audit 和 durable artifact 的不同生命周期。

## 权威来源

- `docs/DESIGN.md`：第十章
- Contracts：`CAP-RACE-001`、`DATA-LIFE-001`、`VISUAL-BIND-001`

## 核心内容

Edge `captureVisibleTab` 受 active tab、navigation、document 和 mask race 影响。capture 使用 expected target 和 monotonic epoch；A→B→A 激活、导航、document replacement 或 mask invalidation 都会使本次结果丢弃。执行按 window 串行，截图在本地 mask/crop 后才上传，动态 canvas/video/animation 无法可靠遮罩时拒绝上传。

数据生命周期分为 ephemeral selection/claim/confirmation、crash-safe control metadata、bounded audit metadata、P3 memory-first capture 和 P6 durable artifact。每类数据都有 owner、TTL、absolute expiry、quota、lease、删除和 restart 语义。P3 本地 audit metadata 是默认开启、允许用户关闭的增强项；关闭后停止写入新审计记录，但不会关闭实时安全校验或错误显示。

P6 默认把持久资源写入 Coordinator 所在系统的每用户数据目录，并允许用户通过受信任本机设置选择自定义 artifact root。自定义根要先做权限、symlink、读写、rename/delete、容量和 durability probe，迁移失败时继续使用旧根，不能静默形成两个 store。

用户可以用文件选择或拖放导入自己的静态 PNG/JPEG/WebP。导入采用 copy-on-import，先有界解码、清除 metadata、规范化、预览并提供 mask/crop，再注册为 `user-imported` reference。手工导入不是浏览器 capture，不需要 active-tab/origin/capture-epoch 检查；首个 P6 baseline 不支持外部文件链接、远程 URL 或递归目录导入。

导入只创建图片资源，不自动产生源码关系。用户把图片绑定到当前 selection、region 或 page root 后，`VisualReferenceBinding` 才记录 target、direct-primary/related evidence 或明确降级 candidate 的 hash 与 revision；像素本身不用于猜源码。active 绑定可以跨同一 reference task 的多轮修改、HMR 和比较，用户可以 pause、resume、complete、cancel 或 replace。绑定只提供视觉目标，不替代 claim、一次性确认或 verification。

“参考图还在指导修改”和“图片还保存在磁盘”是两个生命周期。取消或完成指导会阻止图片进入新的 Codex context，但不会自动删图；删除 artifact 会终止全部绑定。普通读取不会续期，只有用户显式操作才能建立新的有限保留周期。active reference 使用 lease 防止 idle/quota 误删，但不能无限突破 absolute expiry。

## 关键边界

- DOM mask 是纵深防御，不保证识别所有敏感像素。
- P3 短时 capture resource 不承诺跨进程 pin 或 orphan recovery。
- P6 才引入 durable artifact、tombstone 和 sweeper。
- 源码路径仍限制在 project root；artifact 只能位于托管根或用户明确选择的根，页面和 Codex 只得到 opaque resource URI。
- 手工导入时用户的文件选择就是本次导入授权，不重复套用自动截图授权；格式、大小、metadata、TTL 和 quota 检查仍执行。
- 未绑定图片只是视觉资料；VisualReferenceBinding 不是编辑授权，也不能把候选源码升级成 exact。
- 用户取消指导不等于删除文件，删除文件则必须使相关绑定失效。

## 后续验收问题

1. 为什么 A→B→A 仍要丢弃截图？
2. 自动截图与用户外部导入分别需要哪些检查？
3. P3 memory-first resource 与 P6 durable artifact 有何不同？
4. TTL、lease 和 quota 各自控制什么风险？
5. 默认托管根、自定义根、copy-on-import 和 link mode 有何区别？
6. 参考任务生命周期、编辑授权生命周期和 artifact 保留生命周期为什么必须分开？

1. 要丢弃。只检查前后都是 A 发现不了中间切到 B，实际像素可能来自 B；capture epoch 内出现任何失效事件都要重拍。
2. 自动截图检查 project/origin/active tab/document、授权、竞态和本地 mask/crop；用户导入跳过这些浏览器竞态检查，但要做用户手势、文件格式/签名、有界解码、metadata、预览、生命周期和 ownership 检查。
3. memory-first resource 用于短时验证，session/process 结束即删除；durable artifact 可以跨进程保留，但仍受 absolute TTL、quota 和用户清理约束，不等于永久文件。
4. TTL 管理资源最多保留多久；lease 表示资源正在被任务使用，防止误删；quota 限制数量或字节，防止图片过多或过大耗尽空间。
5. 默认根由操作系统每用户数据目录解析；自定义根由用户可信设置并经 probe/迁移；copy-on-import 把规范化副本纳入 VEM 管理，原文件移动不影响它；link mode 只引用外部文件，首个 P6 baseline 尚不支持。
6. 参考任务生命周期决定图片是否继续指导 Codex；编辑授权决定某一次修改能否执行；artifact 生命周期决定图片是否继续占用存储。三者分开后，用户可以停止指导但保留图片，也不会因长期保存图片而获得长期源码修改权限。


## 通过标准

能够描述 capture epoch、自动截图与手工导入的检查差异、VisualReferenceBinding 的非授权性质、指导/授权/存储三种生命周期以及默认/自定义 artifact root，不提前宣称 durable 或 external-link capability。
