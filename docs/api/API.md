# API 接口文档

## 基础信息

- **Base URL**: `http://localhost:3000`
- **Content-Type**: `application/json`
- **SSE 端点**: `text/event-stream`

## 会话接口（多轮对话）

### 响应规范

`POST` / `PUT` / `DELETE` 统一包装为 `{ success: true, data }`：

```json
{ "success": true, "data": { ... } }
```

`GET` 列表与消息端点返回**裸数组**（前端 client 自行归一化）。

### 列出所有会话

```
GET /chat/sessions
```

**响应**（按 `updatedAt desc` 排序）：

```json
[
  {
    "id": "uuid",
    "userId": null,
    "title": "本月销售总览",
    "createdAt": "2026-06-24T09:34:31.575Z",
    "updatedAt": "2026-06-24T17:34:31.547Z"
  }
]
```

### 新建会话

```
POST /chat/sessions
```

**请求体**：

```json
{ "title": "新对话" }   // title 可选，默认 "新对话"
```

**响应**：

```json
{
  "success": true,
  "data": { "id": "uuid", "title": "新对话", "createdAt": "...", "updatedAt": "..." }
}
```

### 加载会话消息

```
GET /chat/sessions/:id/messages
```

**响应**（按 `createdAt asc`）：

```json
[
  {
    "id": "uuid",
    "sessionId": "uuid",
    "role": "user",
    "content": "本月销售总览",
    "metadata": null,
    "createdAt": "2026-06-24T09:37:05.956Z"
  },
  {
    "id": "uuid",
    "sessionId": "uuid",
    "role": "assistant",
    "content": "...",
    "metadata": "{\"toolCalls\":[...],\"toolResults\":[...]}",
    "createdAt": "2026-06-24T09:37:33.123Z"
  }
]
```

> `metadata` 为 JSONB，pg 驱动可能自动反序列化为对象；后端 `buildHistoryMessages` 同时兼容两种形态。

### 重命名会话

```
PUT /chat/sessions/:id
```

**请求体**：

```json
{ "title": "新的标题" }
```

**响应**：

```json
{ "success": true, "data": { "id": "uuid", "title": "新的标题" } }
```

### 删除会话

```
DELETE /chat/sessions/:id
```

**响应**：

```json
{ "success": true, "data": { "id": "uuid" } }
```

> 由于 `ChatMessage_sessionId_fkey ON DELETE RESTRICT`，后端会先删除该会话的全部消息再删除会话本身。

---

## 聊天接口

### SSE 流式消息（推荐）

```
GET /chat/stream?message=...&sessionId=...
```

**Query 参数**：

| 名称 | 必填 | 说明 |
|------|------|------|
| `message` | ✅ | 用户输入 |
| `sessionId` | ✅ | 当前会话 UUID（前端持久化在 localStorage） |

缺失任一参数直接返回错误事件并 `done`。

**响应**：`Content-Type: text/event-stream`，持续推送 SSE 事件，事件类型见下方"SSE 事件流"。

### 同步发送消息（保留兼容）

```
POST /chat/message
```

**请求体**：

```json
{
  "message": "显示2024年销售额趋势",
  "sessionId": "可选的会话ID"
}
```

**响应**（`AiProcessResult`）：

```json
{
  "intent": "chart",
  "message": "已生成图表,基于 12 条数据。",
  "sql": "SELECT DATE(\"saleDate\") as date, SUM(\"amount\") FROM \"Sales\" GROUP BY DATE(\"saleDate\")",
  "executed": true,
  "rows": [{ "date": "2024-01-01", "sum": 1234.56 }],
  "chart": { "xAxis": { "type": "category" }, "series": [{ "type": "line" }] }
}
```

## 数据库接口

### 执行查询

```
POST /database/query
```

**请求体**：

```json
{
  "sql": "SELECT * FROM \"Sales\" WHERE \"saleDate\" >= '2024-01-01'"
}
```

**响应**：原始行数组 `Array<Record<string, unknown>>`

### 获取 Schema

```
GET /database/schema
```

**响应**：数据库表结构信息（列名、类型、是否可空等）

## AI 接口

### 处理消息（低层）

```
POST /ai/process
```

**请求体**：

```json
{ "message": "显示每月销量" }
```

**响应**：

```json
{ "status": "ok" }
```

> 推荐使用 `/chat/stream` 替代此端点。

## SSE 事件流

`/chat/stream` 按以下顺序推送事件：

| 事件 | 触发条件 | `data` 字段 |
|------|---------|------------|
| `text` | LLM 增量 token | `{ content: string }` |
| `tool_call` | LLM 决定调用工具 | `{ name: string, args: object }` |
| `tool_result` | 工具执行完成 | `{ name: string, result: object }` |
| `error` | 异常 / 上限到达 | `{ code: string, message: string }` |
| `done` | **总是最后** | `{}` |

> 工具的 SQL / Chart 走 `tool_result` 数据通道，不再有独立的 `sql` / `chart` / `analysis` 事件。

**典型事件流**（查询 + 图表）：

```
event: text
data: {"content":"好的，"}

event: tool_call
data: {"name":"query_sales","args":{"timeRange":"本月","groupBy":"category"}}

event: tool_result
data: {"name":"query_sales","result":{"totalAmount":1234567,"totalQuantity":890}}

event: tool_call
data: {"name":"gen_chart","args":{"chartType":"bar"}}

event: tool_result
data: {"name":"gen_chart","result":{"chartType":"bar","chart":{...}}}

event: text
data: {"content":"根据以上数据..."}

event: done
data: {}
```

**闲聊/简单对话**（无工具调用）：

```
event: text
data: {"content":"你好"}
event: text
data: {"content":"！"}
event: done
data: {}
```

**错误码**（SSE error 事件）：

| code | 含义 |
|------|------|
| `MAX_ITERATIONS_REACHED` | 工具调用循环达到 `MAX_ITERATIONS` 上限 |
| `PLANNER_FAILED` | PlannerAgent 整体失败 |
| `STREAM_FAILED` | SSE 流本身异常 |
