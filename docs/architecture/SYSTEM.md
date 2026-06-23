# 系统架构设计

> 本文档反映 Phase 1-5 全部完成后的真实架构。运行期发现的问题与解决方案见 [`../development/ISSUES.md`](../development/ISSUES.md)。

## 整体架构

```
┌────────────────────────────────────────────────────────────────────┐
│                       Frontend (apps/web)                          │
│  React 18 + Vite + Zustand + TailwindCSS + Shadcn UI + ECharts    │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  features/chat                                                │ │
│  │   ├─ components/  MessageBubble | ChatInput | DynamicChart   │ │
│  │   │                ChatWindow                                 │ │
│  │   ├─ hooks/       useSSEChat (SSE 客户端 + React 状态)        │ │
│  │   ├─ store/       zustand store (单一数据源)                   │ │
│  │   └─ types.ts     本地消息类型                                 │ │
│  └──────────────────────────────────────────────────────────────┘ │
└────────────────────────┬───────────────────────────────────────────┘
                         │  HTTP POST / SSE GET
┌────────────────────────▼───────────────────────────────────────────┐
│                       Backend (apps/server)                        │
│  NestJS + Prisma + LangChain.js + Ollama (qwen2.5:3b)             │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ ChatModule     POST /chat/message  | GET /chat/stream         │ │
│  │                 └─ ChatService (SSE 编排 + 事件顺序)            │ │
│  │                                                                │ │
│  │ AiModule       └─ AiService.process() (核心编排)               │ │
│  │                  ├─ RouterAgent   混合 Router (关键词快路径     │ │
│  │                  │                  + LLM 兜底)                  │ │
│  │                  ├─ SqlAgent      LLM 生成 SQL + 安全校验       │ │
│  │                  ├─ ChartAgent    LLM 生成 ECharts + 补全       │ │
│  │                  ├─ AnalysisAgent LLM 生成分析文本              │ │
│  │                  └─ (chat)        LLM 直接对话                  │ │
│  │                                                                │ │
│  │ LlmModule       └─ LlmService (ChatOllama 封装 + 超时 + Zod)   │ │
│  │                                                                │ │
│  │ DatabaseModule └─ DatabaseService (Prisma 封装)                │ │
│  └──────────────────────────────────────────────────────────────┘ │
└────────────────────────┬───────────────────────────────────────────┘
                         │ Prisma / SQL           │  HTTP /api/chat
┌────────────────────────▼─────────────┐ ┌──────────────────────────┐
│      PostgreSQL 16 (Docker)          │ │   Ollama (本地/容器)       │
└──────────────────────────────────────┘ │   qwen2.5:3b / qwen3:8b  │
                                       └──────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│              packages/types (前后端共享,Zod Schemas)                │
│  dual 产物: dist/cjs (Node) + dist/esm (Bundler/Vite)             │
│  package.json conditional exports 自动选择                          │
└────────────────────────────────────────────────────────────────────┘
```

## 数据流 (SSE 流式)

用户点击发送 → 前端 `useSSEChat` 打开 `EventSource('/chat/stream?message=...')`
→ 后端 `ChatService` 立即起 `Observable`,驱动 `AiService.process()`
→ 编排过程中按**确定性顺序**发送 SSE 事件:

```
EventSource ─────► ChatService ─────► AiService.process()
   ▲                                        │
   │                                        ▼
   │                              RouterAgent.recognize()
   │                                  │   ┌─────────────────┐
   │                                  │   │ 1. 关键词快路径  │ → chart/analysis/chat
   │                                  │   │ 2. LLM 兜底      │ → sql (默认)
   │                                  │   │ 3. 简单关键词    │ (LLM 失败时)
   │                                  │   └─────────────────┘
   │                                        │
   │              ┌── chat ── LlmService 通用对话 ─┤
   │              │                              ├── sql ── SqlAgent + 执行 ──┐
   │              │                              ├── chart ── + ChartAgent ───┤
   │              │                              └── analysis ── + AnalysisAgent ─┤
   │              │                                                     │
   │              └─────────────────────────────────────────────────────┘
   │                          │
   │                          ▼ 任何 Agent 异常 → 模板回退 → 仍能返回结果
   │
   │  SSE 事件流 (按发送顺序):
   │  ┌─ token (总是先发,用户可见文本) ─┐
   │  ├─ error (失败时) ──────────────┤
   │  ├─ sql (sql 路径) ──────────────┤
   │  ├─ chart (chart 路径) ──────────┤
   │  ├─ analysis (analysis 路径) ────┤
   │  └─ done (总是最后,客户端关闭连接) ┘
```

**LLM 接入的关键设计** (`apps/server/src/modules/ai/llm/`):

- **LlmService 单一入口**: 4 个 Agent 都通过 `LlmService.invoke()` / `invokeStructured()` 调用 Ollama,避免 ChatOllama 实例到处 new。
- **混合 Router** (`router.agent.ts`): 关键词快路径 → LLM 兜底 → 简单模板兜底。3B 模型 4-way 分类不稳定,所以把关键词作为第一道防线。
- **Agent 异常模板回退**: 任何 LLM 失败都回退到原来的模板/关键词逻辑,确保 pipeline 永远不空跑。
- **Zod 结构化校验**: SQL/Chart/Router 都用 Zod schema 校验 LLM 输出,不合法就抛错触发回退。
- **纯文本兜底**: LlmService 自动识别 `sql` / `chart` 这类纯单词输出(3B 模型经常忽略 JSON 指令),包装成 `{ intent: 'sql' }` 通过 schema。

**前端消费 (单一数据源原则)**:

```
useSSEChat 收到 token 事件
    │
    ├─ updateLastAssistant(msg => ({ ...msg, content: newContent }))
    │       │
    │       ▼
    │   zustand store.messages  (唯一真相)
    │       │
    │       ▼
    │   ChatWindow 自动重渲染 (订阅 store)
    │
    └─ 收到 done → setIsLoading(false) + eventSource.close()
        (显式 close 阻断 EventSource 自动重连,详见 ISSUES.md #8)
```

## 模块设计

### 前端模块 (Feature-Based)

```
apps/web/src/features/chat/
├── components/
│   ├── ChatWindow.tsx      主窗口 (订阅 store,渲染消息列表 + 输入区)
│   ├── ChatInput.tsx       输入框 + 发送按钮 (受 isLoading 控制)
│   ├── MessageBubble.tsx   单条消息 (user/assistant/error 类型适配)
│   └── DynamicChart.tsx    ECharts 包装 (按 chartType 渲染)
├── hooks/
│   └── useSSEChat.ts       SSE 客户端 + React 状态桥接
├── store/
│   └── chat.store.ts       zustand store (messages, isLoading, error)
└── types.ts                Message / SSE event payload 类型
```

**关键架构决策**:

- **单一数据源**: 助手消息草稿也直接进 zustand store,不再用 ref 跟踪流式内容 (规避 React key 重复 + setState during render)
- **主动关闭**: `done` 事件时显式 `eventSource.close()`,阻断 EventSource spec 的 3 秒自动重连
- **`closingIntentionallyRef`**: 用 ref 跟踪"主动关闭"标志,区分 SSE `error` 事件 (有 data) vs 连接级 error (无 data)

### 后端模块 (Module-Based)

```
apps/server/src/modules/
├── chat/
│   ├── chat.service.ts       ChatService — SSE 流编排
│   ├── chat.controller.ts    POST /chat/message | GET /chat/stream
│   └── chat.module.ts
├── ai/
│   ├── ai.service.ts         AiService — 核心编排 (调用 Agents + DB + LLM)
│   ├── ai.controller.ts      POST /ai/process
│   ├── ai.module.ts
│   ├── llm/                  ★ LLM 基础设施
│   │   ├── llm.service.ts        ChatOllama 封装 + 超时 + Zod 结构化
│   │   ├── llm.module.ts         LlmModule (DI 容器)
│   │   └── llm.mock.ts           测试用 mock
│   ├── agents/
│   │   ├── router.agent.ts       ★ 混合 Router (关键词 + LLM)
│   │   ├── sql.agent.ts          ★ LLM 生成 SQL + 安全校验
│   │   ├── chart.agent.ts        ★ LLM 生成 ECharts + 补全
│   │   └── analysis.agent.ts     ★ LLM 生成分析文本
│   └── prompts/                  各 Agent 的 prompt 模板
└── database/
    ├── database.service.ts   PrismaClient 封装
    └── database.module.ts    **导出** DatabaseService (DI 必需,见 ISSUES.md #2)
```

**LlmService 接口**:

```ts
// 纯文本调用 (chat / analysis)
await llm.invoke({ system, human, timeoutMs?, temperature? });

// 结构化调用 (router / sql / chart),Zod 自动校验
await llm.invokeStructured({
  system, human, schema: z.object({...}), timeoutMs?, temperature?
});
```

任何异常(超时/JSON 解析失败/Zod 校验失败)都向上抛,Agent 捕获后回退到模板逻辑。

### 共享类型包 (packages/types)

**dual 产物结构** (修复 ISSUES.md #1):

```
packages/types/
├── src/
│   ├── chat.ts              # Zod schemas
│   ├── database.ts          # Zod schemas
│   └── index.ts
├── tsconfig.json            # CJS: module: commonjs, outDir: ./dist/cjs
├── tsconfig.esm.json        # ESM: module: ES2020, outDir: ./dist/esm
└── package.json             # conditional exports (import → esm, require → cjs)
```

**消费方映射**:

| 消费方 | 解析 | 配置 |
|--------|------|------|
| NestJS server (运行时) | CJS | `apps/server/jest.config.js` `moduleNameMapper` 指向 `dist/cjs/index.js` |
| React frontend (Vite) | ESM | `apps/web/tsconfig.json` `paths` 指向 `dist/esm` |
| Jest 单测 | ts-jest 直接读 `src/*.ts` | 注入 `commonjs` 配置覆盖 |

## 技术选型理由

| 技术 | 选型理由 |
|------|---------|
| pnpm | 性能好,原生支持 Monorepo + workspace |
| TypeScript (strict) | 强类型,减少运行时错误 |
| Turborepo | 构建缓存,CI 加速 |
| React 18 | 并发特性 (useTransition / Suspense) |
| Zustand | 轻量级状态管理,无 Provider 嵌套 |
| TailwindCSS | 原子化 CSS,与 Shadcn UI 完美搭配 |
| Shadcn UI | 可复制源码的组件库,不绑死版本 |
| ECharts | 强大的图表库,中文文档完善 |
| NestJS | 强约束架构,适合团队协作 |
| Prisma | 类型安全的 ORM,迁移可视化 |
| LangChain.js | LLM 编排框架 (任务 #4 集成中) |
| Ollama | 本地 LLM,无外部 API 依赖 |
| Zod | 数据校验,与 TS 类型双向推导 |
| EventSource | SSE 浏览器原生 API (注意:有自动重连默认行为) |