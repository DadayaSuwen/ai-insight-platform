# 2026-06-27 PlannerAgent 中间轮 AIMessage 缺 tool_calls 致 OpenAI 400

## 症状

切换到 OpenAI / Anthropic 云端 API 后（refactor/remove-ollama 之后），第一次需要工具调用的对话立刻报 400：

```
ERROR [AiService] [stream] PlannerAgent failed:
  400 Messages with role 'tool' must be a response to a preceding message with 'tool_calls'

Troubleshooting URL: https://js.langchain.com/docs/troubleshooting/errors/INVALID_TOOL_RESULTS/
```

LangChain Tracked URL：<https://js.langchain.com/docs/troubleshooting/errors/INVALID_TOOL_RESULTS/>

## 根因

`PlannerAgent.invokeStream` 的"中间工具调用轮"分支（原 `planner.agent.ts:289`）：

```ts
// 情况 B: 中间工具调用轮 → 整轮 text 不 yield 给前端
messages.push(new AIMessage(currentTurnTextBuffer));   // ❌ 只压入 text
// ... 执行 tool_calls ...
messages.push(new ToolMessage({ tool_call_id, name, content: result }));
```

下一轮 `getChat().stream(messages)` 发出的请求体变成：

```json
[
  { "role": "system", "content": "..." },
  { "role": "user", "content": "..." },
  { "role": "assistant", "content": "让我查一下..." },   // ❌ 缺 tool_calls
  { "role": "tool", "tool_call_id": "uuid-xxx", "content": "..." }  // ← 400
]
```

OpenAI 校验严格：`role:tool` 必须有前一条 `role:assistant` 带 `tool_calls` 配对。Anthropic 同样校验。

**Ollama 不校验这层**，所以这个 bug 在本地推理时隐身。Refactor 之后云端 API 立即暴露。

## 修复

`PlannerAgent.invokeStream` 情况 B 改为压入整个 `finalMessage`（含 LangChain 流式拼接好的 `tool_calls` + `tool_call_id`）：

```ts
// 情况 B: 中间工具调用轮 → 整轮 text 不 yield 给前端
// 但**必须**把整轮 AIMessage（content + tool_calls）都放进 messages 数组
// ——OpenAI 协议严格要求 role:'tool' 消息的前一条 assistant 必须有 tool_calls，
// 否则报 400 "Messages with role 'tool' must be a response to a preceding
// message with 'tool_calls'"。Ollama 不校验这层，但 OpenAI / Anthropic 严格。
// 这里复用 finalMessage（含 LangChain 拼接好的 tool_calls + tool_call_id），
// 下游 ToolMessage 的 tool_call_id 也能与之对得上。
messages.push(finalMessage);
```

下游 `ToolMessage` 的 `tool_call_id: toolCall.id` 直接复用 finalMessage 中同一 tool_call 的 id，**自动配对**。

## 副作用 / 收益

- ✅ 修复 OpenAI / Anthropic 400 报错
- ✅ 修复多轮对话中**第二次**对话（之前已隐式坏掉，本地 Ollama 因不校验也"看起来工作"）
- ✅ 让中间轮的 `tool_calls` 完整进入多轮上下文，LLM 后续能看到自己刚才调用了哪些工具（有助于 reasoning 类模型维持一致性）

## 改动文件

| 文件 | 改动 |
|---|---|
| `apps/server/src/modules/ai/agents/planner.agent.ts` | 情况 B：`messages.push(new AIMessage(text))` → `messages.push(finalMessage)` + 详细注释说明根因 |

## 验证

| # | 操作 | 预期 |
|---|---|---|
| 1 | `pnpm --filter @ai-insight/server exec tsc --noEmit` | ✅ 0 错误 |
| 2 | `pnpm --filter @ai-insight/web exec tsc --noEmit` | ✅ 0 错误 |
| 3 | 发"按地区统计今年销售额"（走 query_sales 工具） | 不再 400；流式正常 |
| 4 | 发"画个分类销售额柱状图"（走 gen_chart 工具） | 不再 400；图表渲染 |
| 5 | 多轮：第一句调工具，第二句追问 | 第二轮不再 400（中间轮的 tool_calls 在 messages 里） |

## 风险点 & 兜底

- **`finalMessage` 类型是 `AIMessageChunk`**：LangChain 内部 `AIMessageChunk` 是 `AIMessage` 的子类，可直接 push 进 `messages: BaseMessage[]`（LangChain 会自动处理）。
- **下游 ToolMessage 的 tool_call_id 来源**：来自 `finalMessage.tool_calls[i].id`，与 `new ToolMessage({ tool_call_id })` 一致——**自动配对，无需手动管理**。
- **不影响 chat.service.ts**：SSE 事件顺序、metadata.toolCalls/toolResults 保存逻辑都不变。
- **不影响 chat.service.ts.buildHistoryMessages**：DB 重建历史时已经手动写入 `AIMessage({content, tool_calls})`，与本修复路径一致。

## 分支 & PR

- 分支：`fix/planner-tool-must-precede-tool-calls`（基于 `refactor/remove-ollama`）
- 单一 commit：`fix(planner): 中间轮 AIMessage 必须含 tool_calls 否则 OpenAI 400`
- PR 标题：**"fix(planner): 中间轮 AIMessage 必须含 tool_calls 否则 OpenAI 400"**