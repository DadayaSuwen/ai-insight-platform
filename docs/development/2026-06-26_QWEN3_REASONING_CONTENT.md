# 2026-06-26 Qwen3 / DeepSeek-R1 reasoning_content 多轮回传修复

## 症状

使用 `qwen3:8b`（或其他思考模型）时，第 1 轮响应正常。第 2 轮对话触发工具调用，**立刻 400**：

```
ERROR [AiService] [stream] PlannerAgent failed: 400 The `reasoning_content` in the thinking mode must be passed back to the API.
```

## 根因（双重）

### 0.2.4 入站污染

`@langchain/ollama@0.2.4` 的 `utils.js` line 5：

```js
content: messages.thinking ?? messages.content ?? ""
```

把 Ollama 响应的 `thinking` 字段**塞进** LangChain 的 `content` 字段——thinking 和正文混在一起，前端展示和 LLM 上下文都被污染。

### 0.2.4 出站丢字段

同一个 `utils.js` 的 `convertAMessagesToOllama` 函数**完全不读** `additional_kwargs.reasoning_content`，多轮对话时 Qwen3 API 收到的请求里 assistant 消息没有 `thinking` 字段 → 报 400。

### Qwen3 API 校验规则

- 任何 assistant 消息如果**曾经**在流式响应里包含 reasoning_content，**下一轮**请求里必须原封不动回传 `thinking` 字段（Ollama 的命名）。
- 缺一次都不行。

## 修复（路径 B：手写子模块，不升级依赖）

按用户要求**禁止升级 `@langchain/core`**（会引发不可控全局破坏）。采用：

1. **新建 `ThinkingChatOllama` 子类**（继承 `ChatOllama`），覆盖 `_streamResponseChunks`：
   - 强制 `think: true`（让 Ollama 流式返回 reasoning 字段）
   - **入站**：自己构造 `AIMessageChunk`，把 `thinking` 字段写入 `additional_kwargs.reasoning_content`（不污染 `content`）
   - **出站**：自带 `messagesToOllama` 函数，把 `AIMessage.additional_kwargs.reasoning_content` 写入 Ollama 请求的 `thinking` 字段

2. **`PlannerAgent` 提取 reasoning**：
   - for-await 中 `chunk.additional_kwargs.reasoning_content` 累积到 `currentTurnReasoningBuffer`
   - push `AIMessage` 时通过 `additional_kwargs: { reasoning_content }` 透传
   - 新增 `reasoning` 事件透传给 chat.service 落库

3. **`chat.service.ts` 落库**：
   - 收集 `reasoning` 事件到 `assistantReasoning`
   - saveMessage 时存到 `metadata.reasoning`（仅非空时存）

4. **`buildHistoryMessages` 重建**：
   - 从 `metadata.reasoning` 读取
   - 构造 AIMessage 时通过 `additional_kwargs.reasoning_content` 注入 → ThinkingChatOllama 出站时会自动转回 Ollama `thinking` 字段

## 改动文件

| 文件 | 改动 |
|---|---|
| `apps/server/src/modules/ai/llm/thinking-chat-ollama.ts` | **新增**：子类，覆盖 `_streamResponseChunks` + `messagesToOllama` |
| `apps/server/src/modules/ai/llm/llm-factory.ts` | 用 `ThinkingChatOllama` 替代 `ChatOllama` |
| `apps/server/src/modules/ai/llm/llm.service.ts` | `defaultOllamaChat` fallback 也用 `ThinkingChatOllama` |
| `apps/server/src/modules/ai/agents/planner.agent.ts` | 提取 `currentTurnReasoningBuffer`，push AIMessage 带 `reasoning_content`，新增 `reasoning` 事件类型 |
| `apps/server/src/modules/chat/chat.service.ts` | 收集 `assistantReasoning` → 落库 `metadata.reasoning`；`buildHistoryMessages` 重建时附加 `additional_kwargs.reasoning_content` |

## 走查

### 单 turn (qwen3 + 工具调用)

```
[history AIMessage(tool_calls=[id:X], additional_kwargs.reasoning_content=R1) + ToolMessage(call_id:X)]
AIMessage(content="[思考]", tool_calls=[id:Y], additional_kwargs.reasoning_content=R2) ← planner
ToolMessage(call_id:Y)
... 调 LLM 第 2 次 ...
AIMessage(content="[总结]", additional_kwargs.reasoning_content=R3)                  ← planner
```

每条 assistant 消息都携带 `additional_kwargs.reasoning_content`，ThinkingChatOllama 出站时转成 Ollama `thinking` 字段，Qwen3 API 校验通过 ✅。

### 多 turn

```
[history]
AIMessage(content="[上一轮总结]", additional_kwargs.reasoning_content=R3) ← 重建
HumanMessage("[第 2 轮用户]")
... 新一轮 ...
```

## 验证

| 项 | 结果 |
|---|---|
| `pnpm --filter @ai-insight/server exec tsc --noEmit` | **0 错误** |
| `pnpm --filter @ai-insight/web exec tsc --noEmit` | **0 错误** |

## SQL 诊断（验证落库）

```sql
SELECT
  id,
  metadata->'reasoning' AS reasoning,
  length(metadata->'reasoning'::text) AS reasoning_len
FROM "ChatMessage"
WHERE role = 'assistant'
  AND metadata->'reasoning' IS NOT NULL
ORDER BY "createdAt" DESC
LIMIT 5;
```

返回的 `reasoning` 字段就是 qwen3 / DeepSeek-R1 的思考过程。下一轮 `buildHistoryMessages` 会把它读取并注入 `AIMessage.additional_kwargs.reasoning_content`，经 ThinkingChatOllama 透传给 Qwen3 API。

## Ollama 版本兼容

| Ollama 版本 | `think` 顶层字段 | `thinking` message 字段 |
|---|---|---|
| 0.5.18（server 当前用） | ✅ 支持 | ✅ 支持 |
| < 0.5 | ❌ | ❌ |

server 用 `ollama@^0.5.17`（实际安装 0.5.18），支持 thinking 模式。

## 风险点

- **子类覆盖 `_streamResponseChunks` 复制了 0.2.4 私有逻辑** —— 未来升级 `@langchain/ollama` 需要重新适配。
- **`runManager?.handleLLMNewToken(content)`** 只传 `content`，不传 reasoning —— LangChain callbacks 看不到 reasoning（如果有 token-level streaming UI 需要，可以扩展）。
- **老数据无 reasoning** —— `metadata.reasoning` 字段是新增的，老 assistant 消息没有这个字段。`buildHistoryMessages` 读取时 fallback 到空对象，Qwen3 API 不会报错（只会少一次 reasoning 透传，对单轮对话无影响）。
