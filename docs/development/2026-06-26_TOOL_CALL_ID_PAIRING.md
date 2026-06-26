# 2026-06-26 ToolMessage 必须配对 AIMessage.tool_calls 修复

## 症状

NestJS 日志抛出 LangChain 校验错误：

```
ERROR [AiService] [stream] PlannerAgent failed: 400 Messages with role 'tool' must be a response to a preceding message with 'tool_calls'
Troubleshooting URL: https://js.langchain.com/docs/troubleshooting/errors/INVALID_TOOL_RESULTS/
```

发生时机：上一轮对话触发了工具调用，再次发消息时立刻 400 流式中断。

## 根因（双重）

### Bug A — 中间轮 AIMessage 不带 tool_calls

修复上一轮"思考暴露"时，planner 在中间轮做了这样的 push：

```ts
// 上一版（错误）：
messages.push(new AIMessage(currentTurnTextBuffer));  // ← 没有 tool_calls!
messages.push(new ToolMessage({ tool_call_id: ..., ... }));
```

把"思考文字"和"工具调用"拆成了**两个独立 AIMessage**。LangChain 校验 ToolMessage 时，会在它之前**最近的** AIMessage 里找 `tool_calls[].id`，但前面那个 AIMessage 没有 tool_calls → 报 400。

**正确顺序**：text + tool_calls 必须是**同一个** AIMessage，ToolMessage 跟在后面。

### Bug B — id 在 planner 与 chat.service 之间不一致

- planner 用 `toolCall.id ?? toolName`（Ollama 原生 id，复用函数名如 `"query_sales"`）
- chat.service 用 `randomUUID()` 覆盖 planner 的 id

后果：planner 内部 messages 数组里 ToolMessage 用的是 Ollama id，而 DB 存的是 UUID。下一轮重建历史虽然能配对，但**当前 turn** 的 messages 数组传给 LLM 时，Ollama id 在 messages 列表里跨 turn 会重复 → LangChain 报 "Duplicate tool_call_id"。

## 修复

### planner.agent.ts

1. **`PlannerToolCallData` / `PlannerToolResultData` 加 `id: string` 字段**——下游能用 event.data.id
2. **planner 自己生成稳定 UUID**：

```ts
let idCounter = 0;
const idGenerator = () => `${randomUUID()}-${idCounter++}`;
```

counter 后缀保证即便同一 turn 多次调同一函数，UUID 也全局唯一。

3. **中间轮构造 AIMessage 时同时设 content + tool_calls**：

```ts
const toolCallsForMessage = finalMessage.tool_calls.map((tc) => ({
  id: idGenerator(),        // ← 稳定 UUID
  name: tc.name ?? "",
  args: tc.args ?? {},
  type: "tool_call" as const,
}));

messages.push(new AIMessage({
  content: currentTurnTextBuffer,    // 思考文字（保留 LLM 上下文）
  tool_calls: toolCallsForMessage,   // 工具调用
}));
```

4. **执行工具时复用同一 UUID**：

```ts
for (let i = 0; i < finalMessage.tool_calls.length; i++) {
  const toolCallMeta = toolCallsForMessage[i];
  const toolCallId = toolCallMeta.id;   // ← 复用上面的 UUID

  // yield 时也带 id
  yield { type: "tool_call", data: { id: toolCallId, ... } };
  yield { type: "tool_result", data: { id: toolCallId, ... } };

  // 内部 ToolMessage 也用同一 id
  messages.push(new ToolMessage({ tool_call_id: toolCallId, ... }));
}
```

### chat.service.ts

复用 planner yield 的 id，不再另行 randomUUID：

```ts
case "tool_call":
  pendingToolCallId = event.data.id ?? null;
  assistantToolCalls.push({ ...event.data });
  break;
case "tool_result":
  assistantToolResults.push({
    ...event.data,
    id: pendingToolCallId ?? event.data.id ?? randomUUID(),
  });
  break;
```

## 消息数组走查

### 单 turn (第 1 轮)

```
SystemMessage(...)
[history AIMessage(tool_calls=[{id:UUID-X}]) + ToolMessage(tool_call_id:UUID-X)]  ← 重建
HumanMessage("[用户消息]")
AIMessage(content="[思考]", tool_calls=[{id:UUID-Y}])  ← planner push
ToolMessage(tool_call_id:UUID-Y, ...)                  ← planner push
... 调 LLM 第 2 次 ...
AIMessage(content="[最终总结]")                          ← planner push（最终轮）
```

UUID-X 来自 DB 重建，UUID-Y 来自 planner 的 idGenerator。两者不冲突。

### 多 turn (第 2 轮)

```
SystemMessage(...)
AIMessage(content="[上一轮思考]", tool_calls=[{id:UUID-Y}])  ← 重建
ToolMessage(tool_call_id:UUID-Y, ...)
AIMessage(content="[上一轮总结]")                          ← 重建
HumanMessage("[第 2 轮用户消息]")
AIMessage(content="[新思考]", tool_calls=[{id:UUID-Z}])     ← planner push
ToolMessage(tool_call_id:UUID-Z, ...)
... 调 LLM ...
AIMessage(content="[新总结]")
```

每个 ToolMessage 都能在它之前最近的 AIMessage.tool_calls[].id 里找到自己的 id ✅。

## 验证

| 项 | 结果 |
|---|---|
| `pnpm --filter @ai-insight/server exec tsc --noEmit` | 0 错误 |
| `pnpm --filter @ai-insight/web exec tsc --noEmit` | 0 错误 |

## 风险点

- **idGenerator 闭包**：每次 invokeStream 调用内部独立计数器——但**不**与上一轮的计数器连续。这是**预期**的（每个 turn 是独立 generator 实例），UUID 自身保证全局唯一，counter 后缀只是防御。
- **buildHistoryMessages 重建时 content=""**：当前 turn 是 content="[思考]"，重建历史是 content=""——两种状态 LangChain 都接受（content 仅用于 LLM 上下文记忆，不影响 tool_calls 校验）。
- **DB 老数据兼容性**：`one-time-fix-tool-call-ids.sql` 已经在之前 commit 加过，老数据已经有 id 字段，本修复不影响老数据读取。

## 相关 commit

（本次修复 commit 待 push）
