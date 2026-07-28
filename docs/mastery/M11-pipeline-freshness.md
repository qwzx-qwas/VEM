# M11：数据管道、缓存与新鲜度

## 本块目标

理解控制面、数据面、队列和 runtime observation freshness 之间的关系。

## 权威来源

- `docs/DESIGN.md`：第九章
- Contracts：`PIPE-BOUND-001`、`OBS-FRESH-001`

## 核心内容

控制消息与截图等大数据走不同优先级和传输路径。队列有容量、high/low-water、drop policy、取消和 backpressure；重要事件使用 message ID、ACK、重试和幂等，避免截图负载拖慢 auth 或 HMR。

代码 revision 没变化并不代表页面观察仍新鲜。异步 DOM、route、目标尺寸、scroll、resize 和 zoom 都会改变观察。Context cache key 因此包含 provider-scoped runtime、target 和 viewport epoch；verification 不从普通 context cache hit 直接产生 `passed`。

## 关键边界

- buffer、cache 和 durable storage 是不同概念。
- 只有同一 project instance 内的 coordinator sequence 可排序；build revision 是 opaque identity。
- reconnect 不能无限保存消息或恢复过期敏感状态。

## 后续验收问题

1. 为什么 screenshot 不能和 auth/HMR 共用一个无界队列？
2. build revision 不变时，哪些页面变化仍使缓存陈旧？
3. verification 为什么要绕过普通 cache pass 路径？
4. ACK、重试和幂等分别如何配合？


1.screenshot太大了，而auth/HMR通常很小且优先级更高，二者不应该放在同一个通道中：auth、HMR 等走高优先级的控制面；
截图等大数据走独立的数据面；
截图传输有字节和并发上限，并且可以取消；
队列达到 high-water mark（高水位）后暂停接收；
降至 low-water mark（低水位）后恢复，这就是 backpressure（回压）
2.代码构建版本没有变化，不能说明页面运行状态没有变化。
3.防止浏览器更新失败，将修改前的页面当成修改后的结果，从而错误返回passed
4.流程：
浏览器发送消息
coordinator收到并处理消息
coordinator返回ack
浏览器收到ack后才删除待发送记录
如果ack丢失
就是要重试，即重新发送信息
当coordinator知道已经处理过了（幂等）
就直接返回相同的结果和ack


## 通过标准

能够区分控制/数据面，并用 runtime epoch 解释陈旧缓存风险。
