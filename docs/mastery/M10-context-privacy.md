# M10：按需上下文与隐私

## 本块目标

理解为何先发小型 SelectionSummary，再按明确需求请求上下文，并识别 P0 的最低出站隐私线。

## 权威来源

- `docs/DESIGN.md`：第八章、§16.3–16.4
- Contract：`PRIV-MIN-001`

## 核心内容

VEM 不主动推送整页 DOM、样式或源码。第一阶段只发有界 SelectionSummary；第二阶段由 Codex 根据任务构造 `ContextRequest`，声明 `needs`、深度、字节和节点限制。TaskIntent 可由 Codex 本地形成，但它不是服务端权限事实。

P0 第一个 summary 出站前已经过滤表单 value、password、private subtree、URL query/fragment/secret 和 prompt-injection 数据。页面文本和诊断只是 untrusted data；兼容 text output 也要保留这个标记。

## 关键边界

- origin 可以默认返回，pathname 只返回 redacted form。
- 错误响应不能把敏感输入原样回显。
- 请求更多上下文不能越过项目路径和隐私底线。

## 后续验收问题

1. 两阶段上下文获取怎样降低隐私和 payload 风险？
2. 哪些字段在第一条 P0 summary 前就要被排除？
3. 为什么 TaskIntent 不能作为权限判断？
4. 页面中的提示词样文本应如何呈现给 Codex？


1.SelectionSummary阶段：先发送一张很小的“元素名片”：这是一个按钮、文字是“登录”、位置多大、来自哪个页面等
ContextRequest（上下文请求）：Codex 确认任务后，再通过 needs 指定需要的信息。比如调整宽度时，只请求按钮样式、尺寸和父容器布局。
2.密码；
input、textarea、select 当前填写的值；
Cookie、Token、Authorization；
URL 的 query 和 fragment，例如 ?token=abc、#secret；
可能包含用户信息的原始路径和页面标题；
data-vem-private 或用户指定为私有的页面区域；
日志、诊断信息中的密钥和凭据；
未知的、多余的嵌套字段。
3.TaskIntent 只是codex对任务的本地分类，并不是权限
4.把它放在明确的页面数据字段中；
标记为 untrusted data，即“不可信数据”；
限制长度，并过滤其中的秘密信息；
即使降级成普通文本输出，也要保留“不可信”标记；
绝不能把它拼接成系统指令或开发者指令。


## 通过标准

能够给出最小出站字段思想，并说明上下文预算与权限是两件事。
