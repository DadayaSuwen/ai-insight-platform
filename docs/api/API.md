# API 接口文档

## 基础信息

- **Base URL**: `http://localhost:3000`
- **Content-Type**: `application/json`
- **SSE 端点**: `text/event-stream`

## 聊天接口

### 同步发送消息 (返回完整结果)

```
POST /chat/message
```

**请求体**:

```json
{
  "message": "显示2024年销售额趋势",
  "sessionId": "可选的会话ID"
}
```

**响应** (返回 `AiProcessResult`):

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

### SSE 流式消息 (推荐)

```
GET /chat/stream?message=...
```

**Query 参数**:
- `message` (必填) — 用户输入

**响应**: `Content-Type: text/event-stream`,持续推送 SSE 事件,事件类型见下方"SSE 事件流"。

## 数据库接口

### 执行查询

```
POST /database/query
```

**请求体**:

```json
{
  "sql": "SELECT * FROM \"Sales\" WHERE \"saleDate\" >= '2024-01-01'"
}
```

**响应**: 原始行数组 `Array<Record<string, unknown>>`

### 获取 Schema

```
GET /database/schema
```

**响应**: 数据库表结构信息 (列名、类型、是否可空等)

## AI 接口

### 处理消息 (低层)

```
POST /ai/process
```

**请求体**:

```json
{
  "message": "显示每月销量"
}
```

**响应**:

```json
{ "status": "ok" }
```

> 推荐使用 `/chat/stream` 替代此端点。

## SSE 事件流

`/chat/stream` 按以下顺序推送事件 (除 `done` 外,每种事件最多一次):

| 事件 | 触发条件 | `data` 字段 |
|------|---------|------------|
| `tool_call` | LLM 决定调用工具 | `{ name: string, args?: object }` |
| `tool_result` | 工具执行完成 | `{ name: string, result: object }` |
| `sql` | SQL 已生成并执行 | `{ sql, executed, rows?, rowCount? }` |
| `chart` | 图表已生成 | `{ chartType, title?, data: { option, rows } }` |
| `analysis` | 分析报告已生成 | `{ content: string }` |
| `token` | 最终 LLM 文本流 | `{ content: string, isFinal?: false }` |
| `error` | 当 result.error 存在 | `{ code: string, message: string }` |
| `done` | **总是最后** | `{}` |

**典型事件流** (查询 + 图表):

```
event: tool_call
data: {"name":"query_sales","args":{"timeRange":"last_month","groupBy":"category"}}

event: tool_result
data: {"name":"query_sales","result":{"sql":"...","rows":[...],"rowCount":5}}

event: sql
data: {"sql":"SELECT \"category\", SUM(\"amount\") as total FROM \"Sales\" GROUP BY \"category\"","executed":true,"rows":[...],"rowCount":5}

event: tool_call
data: {"name":"gen_chart","args":{"sql":"...","chartType":"bar"}}

event: tool_result
data: {"name":"gen_chart","result":{"chartType":"bar","data":{...}}}

event: chart
data: {"chartType":"bar","data":{"option":{...},"rows":[...]}}

event: token
data: {"content":"根据查询结果，我为您生成了以下柱状图..."}

event: done
data: {}
```

**闲聊/简单对话** (无工具调用):

```
event: token
data: {"content":"你好"}
event: token
data: {"content":"！"}
event: done
data: {}
```

**错误码** (SSE error 事件):

| code | 含义 |
|------|------|
| `TOOL_EXECUTION_FAILED` | 工具执行异常 (数据库/LLM 等) |
| `LLM_UNAVAILABLE` | LLM 服务不可用 |
| `STREAM_FAILED` | SSE 流本身异常 |
| `INVALID_MESSAGE` | 缺少 message 参数 |
