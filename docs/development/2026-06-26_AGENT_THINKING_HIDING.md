# 2026-06-26 Agent 思考过程隐藏 + "只说不做" 修复

## 症状

用户在 AI Insight Platform 中向 agent 发送消息触发工具调用时，**模型在调工具前的"思考/解释"文字被一字不漏展示给用户**：

1. **第一轮**：模型在没数据时直接文字道歉（"遗憾地通知您，尽管查询过程中采取了多种筛选参数..."）
2. **第二轮**：用户精确给参数后，模型**嘴上说**"我们将通过以下工具调用：query_sales..."、"我将调用上述工具..."，**但 tool_calls 为空** → 前端没收到 `tool_call` 事件 → 没图没表

## 根因

`apps/server/src/modules/ai/agents/planner.agent.ts` 在 for-await 流式输出阶段（修复前），每个 text chunk 都**立即** `yield { type: "text" }` 给前端：

```ts
for await (const chunk of stream) {
  const content = this.extractContent(chunk.content);
  if (content) {
    yield { type: "text", data: { content } };  // ← 立刻给前端
  }
  // ...
}
```

这导致：
- **流式架构没有区分"中间轮 text"和"最终轮 text"**——所有轮的文字都一视同仁转发
- qwen2.5:3b 在调工具前会**叙述**它要调什么工具（"我将使用 query_sales..."）
- 模型在"叙述"和"行动"之间**根本没进入 tool_call 模式**（finalMessage.tool_calls 为空），只输出文字

## 修复

### Commit 1: `fix(ai): 隐藏 agent 中间思考文字 + 强约束 prompt`

**planner.agent.ts**:
- PlannerStreamEvent union 加 `thinking` 类型
- for-await 改用 `currentTurnTextBuffer` 局部变量，**不**逐 chunk yield
- 轮末分流：
  - `tool_calls.length === 0`（最终总结）→ `yield type:"text"` 整轮
  - `tool_calls.length > 0`（中间工具调用）→ `yield type:"thinking"` 整轮（不展示给用户）
- 无论哪种情况都 `messages.push(new AIMessage(text))` 保留 LLM 上下文
- system prompt 加【绝对红线】4 条最高优先级负面指令

**关键点**：即使 prompt 是软约束，buffer + 轮末分流是**硬约束**——不管模型嘴上怎么说，text 都进 buffer，最终 yield 给前端的只有"工具都跑完后的总结"。

### Commit 2: `fix(chat): 中间轮 thinking 存到 metadata.thinking 供调试`

**chat.service.ts**:
- 加 `assistantThinking` collector
- switch case 加 `thinking` 分支
- saveMessage 时把 thinking 拼到 metadata（**仅非空时存**，避免无意义字段）
- 重构 if/else if 为 switch（可读性 + 扩展性）

`metadata.thinking` 用途：
1. 后端日志排查"只说不做"的 LLM 行为
2. 未来加折叠 thinking 面板时直接消费
3. **不入 content 字段** → 不污染多轮 LLM 上下文

## 验证步骤

| # | 操作 | 预期 |
|---|---|---|
| 1 | `pnpm --filter @ai-insight/server exec tsc --noEmit` | 0 错误 |
| 2 | 发"按地区统计今年销售额" | 流式期间**看不到**"我将使用..."文字，**直接显示**⏳ 正在执行 query_sales → DataTable → 最终 Markdown 总结 |
| 3 | 发"画个分类销售额柱状图" | 流式期间**看不到**思考文字，**直接显示**⏳ 正在执行 gen_chart → 图表 → Markdown 总结 |
| 4 | 发一个让 LLM 不调工具能直接回答的问题（如"你好"） | 文字正常显示（最终轮无 tool_calls → 走 type:"text" 分支） |
| 5 | psql 查历史 thinking 落库 | 见下方 SQL |
| 6 | 切到下一轮对话看历史重建 | 重建出来的 assistant 消息只显示 final content，没有 thinking 文字 |

### SQL 诊断

```sql
-- 看 5 条最近的 assistant 消息的 thinking 字段
SELECT
  id,
  substring("content", 1, 50) AS content_preview,
  metadata->'thinking' AS thinking,
  length(metadata->'thinking'::text) AS thinking_len
FROM "ChatMessage"
WHERE role = 'assistant'
  AND metadata->'thinking' IS NOT NULL
ORDER BY "createdAt" DESC
LIMIT 5;
```

返回的 `thinking` 字段就是 planner 中间轮被丢弃的文字，证明 LLM 上下文没破。

### 验证 LLM 上下文没破

```sql
-- 验证 metadata.content 只包含最终总结，不包含中间轮 thinking
SELECT
  id,
  "content",
  metadata->'thinking' AS thinking
FROM "ChatMessage"
WHERE role = 'assistant'
  AND metadata->'thinking' IS NOT NULL
ORDER BY "createdAt" DESC
LIMIT 3;
```

观察 `content` 是 Markdown 总结，"thinking" 是"我将使用..."叙述。两者**互不污染**。

## 风险点 & 兜底

- **Qwen 3B 仍然说"我将要调工具"** → buffer + 轮末分流是硬约束，prompt 是软约束
- **多轮对话下 LLM 看到自己的"思考"可能学坏** → 验证步骤 6 已覆盖；如有问题可改为只保留最近一轮的 thinking
- **极端情况：模型在最终轮既说总结又调工具** → LangChain 不允许这样（一个 response 要么有 tool_calls 要么有 content），无需处理
- **AbortError 路径** → 中间轮 text 已被 yield `thinking` 事件，partial save 已包含（之前的 partial 修复）

## 后续可选优化（不在本 PR）

1. **前端折叠 thinking 面板**：`metadata.thinking` 已经落库，前端 `recordToChatMessage` 解出后渲染 `<details>` 折叠组件，方便调试
2. **tool_call 进度细化**：当前 timeline 是 tool name + count，可加 "⏱ 1.2s 耗时"
3. **LLM 上下文 thinking 截断**：超过 N 字符的 thinking 在 messages 数组中只保留前 N 字符

## 相关 commit

- `54e00ca` fix(ai): 隐藏 agent 中间思考文字 + 强约束 prompt
- `de4e0a7` fix(chat): 中间轮 thinking 存到 metadata.thinking 供调试
