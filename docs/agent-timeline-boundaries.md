# Agent 对话展示边界

## 公开内容与运行原文

- `kind: user` 保留用户原文。
- `kind: assistant/final/answer/result/assistant_final` 是明确公开回复通道；其中混入的 Reasoning、分析标签、命令、代码块与 diff 仍须净化。
- `kind: hermes` 是终端文本传输，不等于公开回复。仅在识别到 Hermes 公开消息框、`Final answer:` / `最终答复：` 或 `<final>` 等边界后显示正文。工具调用、框结束、私有标题等会关闭公开边界。
- 其他类型或缺少边界的历史片段默认只显示系统摘要。不能根据中文语气、emoji、段落位置、最后一句或 `Resumed session` 猜测答复。
- 普通 service/tool/tool_result/progress 等操作说明保留正文，默认折叠，展开后可读；不再把所有日志统一替换成类别。Reasoning、无法可靠分离的终端片段、原始补丁和命令代码继续净化。
- 历史回放的 `◆ Hermes:` 是公开回复边界，支持换行续段；`● You:` 系统提示与内嵌工具标签不混入回复。实时回复框内的 preparing terminal、命令状态徽标和进度装饰属于覆盖状态，不关闭回复边界；真正工具调用仍关闭边界。
- 展示名称统一为 BidVolt；内部运行目录用“[工作目录]”代称，不输出底层引擎名称，也不伪造实际文件路径。用户自己输入的文本不改写。
- HTTP chat/interaction reply 使用同一 `publicAgentReply` 净化。若混合输出不能可靠分离公答，返回空串，不据此制造已回复状态。

这是展示层边界，不修改后端历史。当前 SSE 模型只有 `seq/kind/content`，无法还原未标注的私有/公开语义；历史记录缺少公答框时，普通旧说明也可能仅显示摘要。后端应提供结构化公开 channel/final 内容，不能依赖终端抓屏文本表达权限。

## 消息顺序

- 本地用户消息记录 `afterSequence`；HTTP 回复记录 `replyToMessageId`，并只与该序号之后的新 SSE echo 一对一合并。
- `actionListAfterSequence` 在新结束提示到达时捕获；后续聊天、相同提示的重复 end、同任务状态刷新保持不变。提示变化才记录新边界。
- `createAgentRunViewModel` 刷新已有任务时传入 `previousRun`。状态先于历史加载时锚为 `null`，日志加载后再补齐。
- 历史没有固定锚时只能用本地提交边界回退；后端没有 action_list 的原始时间/序号，无法精确重建所有旧轮次。

回归：`src/shared/ui/agent-timeline-classification.test.ts`、`AgentActivityTimeline.test.tsx`、`src/shared/task-events.test.ts`。测试同时检查公开答复保留、私有原文在展开后仍不可见、流式分片及序号断档、HTTP 回复、提示固定锚和重复消息因果顺序。
