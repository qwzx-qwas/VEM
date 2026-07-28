# Task Checkpoints

本目录用于长任务中断后的续接记录，不是任务完成状态源。

只有当前 `in_progress` task 可以建立 checkpoint，建议文件名为 `<TASK-ID>.md`。任务完成或阻塞时，正式状态仍写入 `ROADMAP.yaml`，证据写入 `docs/progress.md`；prompt 文档下不手工追加“已完成”。

建议模板：

```markdown
# <TASK-ID> Checkpoint

- Roadmap status at checkpoint: in_progress
- Recorded at:
- Last completed step:
- Evidence produced:
- Commands already run:
- Current limitation or failure:
- Exact next step:
- Files with uncommitted task changes:
```

checkpoint 不能把测试失败解释为完成，也不能代替 dependency、decision 或 phase gate。
