# M18：Contract 与双向追踪

## 本块目标

掌握 `requirements.yaml` 如何连接规范正文、roadmap task 和 required test category。

## 权威来源

- `docs/requirements.yaml`
- `docs/DESIGN.md`：§0、§17.3
- Contract：`REQ-TRACE-001`

## 核心内容

当前 schema v3 登记 25 个稳定 contract。每个 contract 给出 authoritative sections、introduced phase、roadmap tasks 和 required tests。每个 roadmap task 也直接声明 `contracts`，两侧集合保持一致。

覆盖规则目前依赖 `docs/DESIGN.md` 的精确 heading own-body：含规范词的 section 要被至少一个 contract 覆盖。P0-T2 将实现 validator，检查未知 contract、孤立 task、依赖环、decision attempt、失效链接和双向映射。

本轮没有移动规范正文，因为单一 `design_source + exact heading` 尚不适合多文件拆分。未来先升级为 `path + stable anchor`，再逐个抽取 contract。

## 关键边界

- requirements 索引不复制规范正文。
- required test category 目前不是已经存在的测试文件或证据。
- 只更新 roadmap 或 requirements 一侧会造成追踪失真。

## 后续验收问题

1. 一个 contract 当前包含哪四类追踪信息？
2. 为什么 task 和 requirements 要维护双向相等映射？
3. 当前 exact heading 方案为什么阻碍直接拆分 `DESIGN.md`？
4. 追踪何时从“设计好的规则”变成“已机械执行”？

## 通过标准

能够描述完整追踪链，并理解当前 validator 尚未实现这一事实。
