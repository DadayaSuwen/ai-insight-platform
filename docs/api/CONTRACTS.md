# 数据契约定义

本项目使用 **Zod** 定义前后端共享的数据契约，确保类型安全。

## 包结构

```
packages/types/
├── src/
│   ├── chat.ts        # 聊天相关类型
│   ├── database.ts    # 数据库相关类型
│   └── index.ts      # 导出入口
└── package.json
```

## Chat 类型 (chat.ts)

### 枚举

```typescript
// SSE 事件类型
enum SSEEventType {
  TOKEN = 'token',      // 普通文字流
  SQL = 'sql',          // 生成的 SQL
  CHART = 'chart',     // 图表配置
  ANALYSIS = 'analysis', // 分析报告
  ERROR = 'error',     // 错误
  DONE = 'done',       // 完成
}
```

### 请求 Schema

```typescript
// 聊天消息请求
ChatMessageRequestSchema = z.object({
  message: z.string().min(1),
  sessionId: z.string().uuid().optional(),
});

// 创建会话请求
CreateSessionRequestSchema = z.object({
  title: z.string().optional(),
  userId: z.string().optional(),
});
```

### 响应 Schema

```typescript
// 聊天消息响应
ChatMessageResponseSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string(),
});

// 会话 Schema
ChatSessionSchema = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  userId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// 聊天历史响应
ChatHistoryResponseSchema = z.object({
  session: ChatSessionSchema,
  messages: z.array(ChatMessageSchema),
});
```

### SSE Schema

```typescript
// SSE 消息
SSEMessageSchema = z.object({
  event: SSEEventType,
  data: z.string(),
});

// Token 数据
SSETokenDataSchema = z.object({
  content: z.string(),
  isFinal: z.boolean(),
});

// SQL 数据
SSESQLDataSchema = z.object({
  sql: z.string(),
  executed: z.boolean(),
});

// 图表数据
SSEChartDataSchema = z.object({
  chartType: z.enum(['line', 'bar', 'pie', 'scatter', 'area']),
  title: z.string().optional(),
  xAxis: z.string().optional(),
  yAxis: z.string().optional(),
  data: z.record(z.string(), z.any()),
});

// 分析数据
SSEAnalysisDataSchema = z.object({
  content: z.string(),
  keyInsights: z.array(z.string()).optional(),
});

// 错误数据
SSEErrorDataSchema = z.object({
  code: z.string().optional(),
  message: z.string(),
  details: z.string().optional(),
});
```

## Database 类型 (database.ts)

### 请求 Schema

```typescript
// 数据库查询请求
DatabaseQueryRequestSchema = z.object({
  sql: z.string().min(1),
  params: z.record(z.unknown()).optional(),
});
```

### 响应 Schema

```typescript
// 查询响应
DatabaseQueryResponseSchema = z.object({
  rows: z.array(z.record(z.unknown())),
  rowCount: z.number(),
  affectedRows: z.number().optional(),
});

// 列信息
ColumnInfoSchema = z.object({
  name: z.string(),
  type: z.string(),
  dataType: z.string(),
  nullable: z.boolean(),
  isPrimaryKey: z.boolean(),
  isForeignKey: z.boolean(),
  defaultValue: z.unknown().optional(),
  maxLength: z.number().optional(),
});

// 表结构
TableSchemaSchema = z.object({
  name: z.string(),
  schema: z.string(),
  columns: z.array(ColumnInfoSchema),
  primaryKey: z.array(z.string()).optional(),
  foreignKeys: z.array(z.object({...})).optional(),
});

// 数据库 Schema
DatabaseSchemaResponseSchema = z.object({
  database: z.string(),
  tables: z.array(TableSchemaSchema),
  totalTables: z.number(),
});
```

## 验证函数

```typescript
// 验证请求
validateChatMessageRequest(data: unknown): ChatMessageRequest
validateDatabaseQueryRequest(data: unknown): DatabaseQueryRequest

// 安全解析（不抛异常）
safeParseChatMessageRequest(data: unknown): ChatMessageRequest | null
safeParseDatabaseQueryRequest(data: unknown): DatabaseQueryRequest | null

// SQL 基础验证
isValidSQL(sql: string): boolean
```

## 使用方式

### 前端使用

```typescript
import { 
  ChatMessageRequestSchema,
  SSEEventType,
  type SSEMessage 
} from '@workspace/types';

// 验证用户输入
const request = ChatMessageRequestSchema.parse({
  message: userInput,
  sessionId: 'uuid...'
});

// 处理 SSE 消息
function handleSSEMessage(message: SSEMessage) {
  switch (message.event) {
    case SSEEventType.TOKEN:
      // 处理流式文本
      break;
    case SSEEventType.CHART:
      // 处理图表
      break;
  }
}
```

### 后端使用

```typescript
import { 
  ChatMessageRequestSchema,
  validateDatabaseQueryRequest 
} from '@workspace/types';

// 验证请求
const validRequest = ChatMessageRequestSchema.parse(body);

// 返回类型安全的响应
return ChatMessageResponseSchema.parse({
  sessionId: uuid(),
  message: 'Hello'
});
```

## 验证层级

1. **前端**: 用户输入时即时验证
2. **后端 API**: 接收请求时验证 (Zod)
3. **数据库**: Prisma 类型安全

这样确保数据在流转的每个环节都是类型安全的。