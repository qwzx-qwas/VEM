# M14：协议、MCP Surface 与错误

## 本块目标

掌握 protocol package、MCP 版本协商、工具边界和诚实错误状态。

## 权威来源

- `docs/DESIGN.md`：第十三、十四章
- Contracts：`MCP-COMPAT-001`、`CORE-BOUND-001`

## 核心内容

Protocol package 定义跨层 schema、RevisionContext、SelectionSnapshot、PageContext、VerificationRun 和 VemError。MCP 初始化协商 primary/compat revision；核心 prepare/wait/complete 路径在不支持 Tasks 的 client 上仍可运行。若协商 Tasks，旧 experimental wire shape 与后来的 extension 形状不混用。

MCP tools 保持 read、verify 和 metadata oriented，不复制 Codex 文件、shell、任意 URL 或 generic CDP 能力。结构化输出与 compatible text output 都保留 provenance、warnings 和 untrusted data 标记。

## 关键边界

- tool error、protocol error、failed assertion、ambiguous 和 needs-review 不合并为一个失败字符串。
- immutable resource 与 mutable active-selection resource 的通知语义不同。
- cancellation 不等于静默成功，也不应遗留无限后台工作。

## 后续验收问题

1. no-task client 为什么仍要完成核心闭环？
2. MCP tools 为什么不提供文件写入或 shell？
3. `failed`、`ambiguous`、`stale` 和 `needs-review` 各表达什么？
4. compatible text output 最容易丢失哪些安全信息？


1.需要跑通最基本最小的流程
2.项目定位问题
3.failed: 证据可靠标明不成立
ambiguous：存在多种解释或候补从而无法唯一判断
stale:过期了
needs-review：用户最终审阅
4.provenance.warnings.limitations等等

## 通过标准

能够说明版本协商、最小工具面和不可合并的错误状态。
