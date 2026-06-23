# 系统架构设计

> 本文档反映 Phase 9 完成的 **Planner + Function Calling** 架构。历史 bug 与旧架构细节见 [`../archived/`](../archived/)。

## 整体架构

```
┌────────────────────────────────────────────────────────────────────┐
│                       Frontend (apps/web)                          │
│  React 18 + Vite + Zustand + TailwindCSS + Shadcn UI + ECharts    │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  features/chat                                                │ │
│  │   ├─ components/  MessageBubble | ChatInput | DynamicChart   │ │
│  │   │                ChatWindow | DataTable                     │ │
│  │   ├─ hooks/       useSSEChat (fetch + ReadableStream)        │ │
│  │   ├─ store/       zustand store (单一数据源)                 │ │
│  │   └─ types.ts     Message / SSE event 类型                   │ │
│  └──────────────────────────────────────────────────────────────┘ │
└────────────────────────┬───────────────────────────────────────────┘
                         │  HTTP POST / SSE GET
┌────────────────────────▼───────────────────────────────────────────┐
│                       Backend (apps/server)                        │
│  NestJS + Prisma + LangChain.js + Ollama (qwen2.5:3b)              │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ ChatModule     POST /chat/message | GET /chat/stream         │ │
│  │                 └─ ChatService (SSE 流编排 + 事件顺序)        │ │
│  │                                                                  │ │
│  │ AiModule       └─ AiService                                   │ │
│  │                  └─ PlannerAgent (★ 核心：工具调用循环)        │ │
│  │                       ├─ query_sales.tool.ts (SQL 查询)       │ │
│  │                       ├─ gen_chart.tool.ts (ECharts 生成)     │ │
│  │                       ├─ gen_analysis.tool.ts (分析报告)      │ │
│  │                       └─ small_talk.tool.ts (闲聊)            │ │
│  │                                                                  │ │
│  │ LlmModule      └─ LlmService (ChatOllama 封装 + 流式 + Zod)   │ │
│  │                                                                  │ │
│  │ DatabaseModule └─ DatabaseService (Prisma 封装)               │ │
│  └──────────────────────────────────────────────────────────────┘ │
└────────────────────────┬───────────────────────────────────────────┘
                         │ Prisma / SQL           │  HTTP /api/chat
┌────────────────────────▼─────────────┐ ┌──────────────────────────┐
│      PostgreSQL 16 (Docker)           │ │   Ollama (本地/容器)       │
└──────────────────────────────────────┘ │   qwen2.5:3b / qwen2.5:3b  │
                                          └──────────────────────────┘
```

## 核心架构：Planner + Function Calling

### 旧架构（已废弃）

```
用户输入 → RouterAgent (4-way分类) → 单一Agent分支 → 模板回退
```

**问题**：互斥单选路由无法处理组合意图（如"按地区显示柱状图并分析趋势"需要 SQL + 图表 + 分析）。

### 新架构（Function Calling）

```
用户输入 + schema context
    ↓
PlannerAgent.invokeStream()  ← ChatOllama.bindTools([4个工具])
    ↓
LLM 返回 tool_calls
    ↓
逐个执行工具 (query_sales / gen_chart / gen_analysis / small_talk)
    ↓
工具结果回灌 → 再次调用 LLM
    ↓
LLM 返回 content → 流式 SSE 输出
```

**本质**：ReAct 循环（Reason + Act）。LLM 负责推理，你的代码负责行动。

---

## 数据流（SSE 流式）

```
用户点击发送 → 前端 useSSEChat 打开 fetch 流式连接
    ↓
ChatService.processMessageStream()
    ↓
PlannerAgent.invokeStream()
    ↓
LLM 识别工具 → tool_call 事件 → 执行工具 → tool_result 事件
    ↓
工具结果回灌 → 再次调用 LLM
    ↓
最终文本流式输出 (token 事件) → done 事件
```

**SSE 事件流（按发送顺序）**：

```
tool_call  → tool_result → (sql|chart|analysis) → token → done
```

---

## 工具定义

### 1. query_sales — 查询销售数据

```typescript
{
  name: "query_sales",
  description: "查询销售数据。支持按时间、地区、类别筛选，并按维度分组。当用户询问销售额、销量、统计时使用。",
  schema: z.object({
    timeRange: z.enum(["last_month", "this_month", "last_quarter"]).optional(),
    region: z.string().optional(),
    groupBy: z.enum(["region", "category"]).optional(),
  })
}
```

**执行逻辑**：
1. TypeScript 构建 Prisma 查询条件（防注入）
2. 执行查询，计算汇总
3. 返回 `{ sql, rows, rowCount }`

### 2. gen_chart — 生成图表

```typescript
{
  name: "gen_chart",
  description: "根据已有数据生成 ECharts 图表配置。当用户要求可视化、画图、展示趋势时使用。",
  schema: z.object({
    sql: z.string(),
    chartType: z.enum(["bar", "line", "pie", "scatter", "area"]).optional(),
  })
}
```

**执行逻辑**：
1. 执行传入的 SQL
2. 生成 ECharts 配置
3. 补全缺失字段（series.data 等）
4. 返回 `{ sql, rows, chart, chartType }`

### 3. gen_analysis — 生成分析报告

```typescript
{
  name: "gen_analysis",
  description: "生成数据分析报告。当用户询问分析、洞察、原因、建议时使用。",
  schema: z.object({
    sql: z.string(),
  })
}
```

**执行逻辑**：
1. 执行 SQL 获取数据
2. 数据截断（最多50行）防止 prompt 爆炸
3. 调用 LLM 生成分析文本
4. 返回 `{ sql, rows, analysis }`

### 4. small_talk — 闲聊

```typescript
{
  name: "small_talk",
  description: "处理闲聊、问候、通用对话。当用户问你好、谢谢、或不涉及数据分析时使用。",
  schema: z.object({})
}
```

**执行逻辑**：直接调用 LLM 通用对话 prompt，返回 `{ reply }`。

---

## PlannerAgent 核心循环

```typescript
async *invokeStream(input: string): AsyncGenerator<PlannerStreamEvent> {
  // 1. 组装上下文 (system prompt + schema + history)
  const messages = buildMessages(input);

  // 2. 绑定工具
  const llm = this.llmFactory.create();
  const tools = PLANNER_TOOLS;  // [query_sales, gen_chart, gen_analysis, small_talk]

  // 3. ReAct 循环 (最多5次迭代)
  for (let i = 0; i < 5; i++) {
    const response = await llm.bindTools(tools).invoke(messages);

    if (response.tool_calls?.length) {
      // 4. 解析工具调用
      yield { type: 'tool_call', data: { name, args } };

      // 5. 执行工具 (Prisma 查询 / ECharts 拼装)
      const result = await executeTool(name, args);

      // 6. 发出向后兼容事件 (sql/chart/analysis)
      yield* emitBackwardCompat(name, result);

      // 7. 工具结果回灌到 messages
      messages.push(new ToolMessage(result, name));
    } else {
      // 8. 无工具调用 → 最终文本输出
      yield { type: 'token', data: { content: response.content } };
      break;
    }
  }

  yield { type: 'done', data: {} };
}
```

---

## 前端 SSE 事件（新增）

| 事件 | 触发时机 | data 字段 |
|------|---------|-----------|
| `tool_call` | LLM 决定调用工具 | `{ name: string, args: object }` |
| `tool_result` | 工具执行完成 | `{ name: string, result: object }` |
| `sql` | 工具执行后（向后兼容） | `{ sql, rows, rowCount }` |
| `chart` | 图表工具（向后兼容） | `{ chartType, data: { option, rows } }` |
| `analysis` | 分析工具（向后兼容） | `{ content }` |
| `token` | 最终 LLM 文本流 | `{ content: string }` |
| `done` | 结束 | `{}` |

---

## 模块设计

### 前端模块 (Feature-Based)

```
apps/web/src/features/chat/
├── components/
│   ├── ChatWindow.tsx      主窗口 (订阅 store, 渲染消息列表 + 输入区)
│   ├── ChatInput.tsx       输入框 + 发送按钮
│   ├── MessageBubble.tsx   单条消息 (user/assistant/error + tool_call/tool_result)
│   ├── DynamicChart.tsx    ECharts 图表渲染
│   └── DataTable.tsx       数据表格 (数字右对齐, ¥格式化)
├── hooks/
│   └── useSSEChat.ts       fetch + ReadableStream SSE 客户端
├── store/
│   └── chat.store.ts       zustand store (messages, isLoading, error)
└── types.ts                Message / SSE event payload 类型
```

### 后端模块 (Module-Based)

```
apps/server/src/modules/
├── chat/
│   ├── chat.service.ts       ChatService — SSE 流编排
│   ├── chat.controller.ts     POST /chat/message | GET /chat/stream
│   └── chat.module.ts
├── ai/
│   ├── ai.service.ts         AiService — 入口，驱动 PlannerAgent
│   ├── ai.controller.ts       POST /ai/process
│   ├── ai.module.ts
│   ├── agents/
│   │   └── planner.agent.ts   ★ PlannerAgent — ReAct 工具调用循环
│   ├── tools/
│   │   ├── query-sales.tool.ts
│   │   ├── gen-chart.tool.ts
│   │   ├── gen-analysis.tool.ts
│   │   ├── small-talk.tool.ts
│   │   └── index.ts           导出 PLANNER_TOOLS
│   └── prompts/
│       └── planner.prompt.ts  System prompt + 工具说明书
├── llm/
│   ├── llm.service.ts         ChatOllama 封装 + 流式 + Zod 结构化
│   ├── llm.module.ts
│   └── llm.factory.ts          LLM 工厂 (Ollama / OpenAI / Anthropic)
└── database/
    ├── database.service.ts     PrismaClient 封装
    └── database.module.ts
```

---

## 技术选型

| 技术 | 选型理由 |
|------|---------|
| pnpm | 性能好，原生支持 Monorepo + workspace |
| TypeScript (strict) | 强类型，减少运行时错误 |
| Turborepo | 构建缓存，CI 加速 |
| React 18 | 并发特性 (useTransition / Suspense) |
| Zustand | 轻量级状态管理，无 Provider 嵌套 |
| TailwindCSS | 原子化 CSS，与 Shadcn UI 完美搭配 |
| Shadcn UI | 可复制源码的组件库，不绑死版本 |
| ECharts | 强大的图表库，中文文档完善 |
| NestJS | 强约束架构，适合团队协作 |
| Prisma | 类型安全的 ORM，迁移可视化 |
| LangChain.js | LLM 编排框架，bindTools 工具调用 |
| Ollama | 本地 LLM，无外部 API 依赖 |
| Zod | 数据校验，与 TS 类型双向推导 |

---

## 架构优势

1. **消灭 RouterAgent**：LLM 看到工具说明书自己决定调用哪个，用户问"你好"一个工具都不调直接输出文本
2. **消灭 SQL 注入**：LLM 不碰 SQL，Prisma 天生防注入
3. **真正的多轮对话**：history 里存了 ToolMessage，下次问"按这个画个饼图"LLM 直接调用 gen_chart
4. **组合意图支持**：单次输入可以调用多个工具，按顺序执行后汇总结果
5. **向后兼容**：emitBackwardCompat 确保旧前端组件无需修改
