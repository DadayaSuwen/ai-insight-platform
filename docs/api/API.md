# API 接口文档

## 基础信息

- **Base URL**: `http://localhost:3000`
- **Content-Type**: `application/json`

## 聊天接口

### 发送消息

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

**响应**:

```json
{
  "sessionId": "uuid",
  "message": "处理中..."
}
```

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

**响应**:

```json
[
  {
    "id": 1,
    "productName": "Product A",
    "amount": "1000",
    ...
  }
]
```

### 获取 Schema

```
GET /database/schema
```

**响应**:

```json
{
  "tables": [
    {
      "name": "Sales",
      "columns": [
        {
          "name": "id",
          "type": "integer",
          "nullable": false,
          "isPrimaryKey": true
        }
      ]
    }
  ]
}
```

## AI 接口

### 处理消息

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
{
  "status": "ok"
}
```

## SSE 事件流

当使用 SSE 时，会推送以下事件类型：

| 事件 | 描述 |
|------|------|
| `token` | 普通文字流 |
| `sql` | 生成的 SQL 语句 |
| `chart` | 图表配置 JSON |
| `analysis` | 分析报告 |
| `error` | 错误信息 |
| `done` | 结束标志 |