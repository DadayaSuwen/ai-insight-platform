# AI Insight Platform

## Project Overview

AI Insight Platform 是一个基于 AI 的数据分析平台，支持自然语言查询、数据可视化和智能分析报告生成。

## Tech Stack

- **Frontend**: React 18 + Vite + Zustand + TailwindCSS + Shadcn UI（Radix + vaul + cva + lucide）+ ECharts
- **Backend**: NestJS + Kysely（运行时）/ Prisma（schema 定义）
- **AI**: LangChain.js（`@langchain/core/messages`）+ OpenAI / Anthropic 云端 API（默认 gpt-4o-mini）
- **Database**: PostgreSQL 16（Kysely + JSONB 存 tool_calls）
- **Monorepo**: Turborepo + pnpm
- **类型共享**：`@workspace/types`（Zod schema + TS 类型）

## Project Structure

```
ai-insight-platform/
├── apps/
│   ├── web/          # 前端 React 应用
│   └── server/       # 后端 NestJS 应用
├── packages/
│   ├── types/       # 共享类型定义
│   └── eslint-config/
├── docs/             # 项目文档
├── .docker/
└── docker-compose.yml
```

## Quick Start

```bash
# 安装依赖
pnpm install

# 启动数据库
pnpm db:up

# 初始化数据库 (生成 Prisma Client + 推送 schema + 种子数据)
pnpm db:seed

# 启动后端
pnpm dev:server

# 启动前端
pnpm dev:web

# 同时启动前后端
pnpm dev:all
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev:web` | 启动前端开发服务器 |
| `pnpm dev:server` | 启动后端开发服务器 |
| `pnpm dev:all` | 启动所有服务 (Turborepo) |
| `pnpm build` | 构建所有项目 |
| `pnpm db:up` | 启动 PostgreSQL 数据库 |
| `pnpm db:seed` | 初始化数据库 (push + seed) |
| `pnpm db:studio` | 打开 Prisma Studio |
| `pnpm docker:build` | 构建 server/web Docker 镜像 |
| `pnpm docker:up` | 后台启动全部 Docker 服务（postgres + server + web） |
| `pnpm docker:down` | 停止并移除容器（保留卷） |
| `pnpm docker:logs` | 跟踪所有容器日志 |
| `pnpm docker:reset` | 销毁卷并重新启动 |
| `pnpm docker:rebuild` | 不缓存重建镜像 |
| `pnpm docker:seed` | 在运行中的 server 容器内手动执行 seed |
| `pnpm docker:infra` | 仅启动 postgres（不开 server/web） |
| `pnpm docker:rebuild` | 不缓存重建镜像 |

## Environment Variables

### apps/server/.env
```bash
DATABASE_URL=postgresql://app:password@localhost:5432/ai_insight
PORT=3000
# [Sprint 4] 数据库连接密码加密 — 32 字节 base64,缺则启动失败
DB_CONFIG_ENCRYPTION_KEY=<base64 32 字节>
# [Sprint 5] JWT 签名密钥 — 至少 32 字符,缺则启动失败
JWT_SECRET=<至少 32 字符,推荐 openssl rand -base64 32>
```

> LLM API Key 通过 `POST /llm/config` 在前端 Settings 页面配置（OpenAI / Anthropic 任选其一），不再使用环境变量注入。
>
> `DB_CONFIG_ENCRYPTION_KEY` 是 [Sprint 4] 引入的数据源密码加密密钥(AES-256-GCM)。生成方式:`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`。
>
> `JWT_SECRET` 是 [Sprint 5] 引入的 JWT 签名密钥(HS256,7 天 TTL)。缺则后端启动直接 throw — 架构师铁律:绝不降级为默认值。

### apps/web/.env
```bash
VITE_API_BASE_URL=http://localhost:3000
```

## API Endpoints

### 会话（多轮对话）
| Method | Endpoint | Description |
|-------|----------|-------------|
| POST | /chat/sessions | 新建会话 |
| GET | /chat/sessions | 列出全部会话（按 `updatedAt desc`） |
| GET | /chat/sessions/:id/messages | 加载会话的所有消息 |
| PUT | /chat/sessions/:id | 重命名会话 |
| DELETE | /chat/sessions/:id | 删除会话（先删消息，再删会话，FK cascade） |

### 聊天
| Method | Endpoint | Description |
|-------|----------|-------------|
| GET | /chat/stream | SSE 流式对话（query: `message` + `sessionId`，**两者都必填**） |
| POST | /chat/message | 同步发送消息（兼容保留） |
| POST | /database/query | 执行 SQL 查询 |
| GET | /database/schema | 获取数据库 schema |
| POST | /ai/process | 处理 AI 消息（低层，推荐用 `/chat/stream`） |

## SSE Events

`/chat/stream` 推送的事件类型：

| Event | Description |
|-------|-------------|
| text | LLM 增量 token（最终文字流） |
| tool_call | LLM 决定调用工具（`{name, args}`） |
| tool_result | 工具执行结果（`{name, result}`；内含 SQL/Chart 数据） |
| error | 错误信息（`{code, message}`） |
| done | 结束标志（总是最后） |

> SQL / Chart / Analysis 数据全部走 `tool_result` 通道，没有独立的 `sql` / `chart`Architecture

**Planner + Function Calling (Agent-as-a-Tool)**：LLM 通过 / `analysis` 事件。

##  `bindTools` 调用 4 个工具：
- `query_sales` — 固定聚合（按月/类别/地区）
- `query_details` — 明细/Top-N/利润分析（任意维度 + 任意指标）
- `gen_chart` — ECharts 图表（ChartAgent LLM-driven，ChartHelper fallback）
- `generate_insight` — 商业洞察（封装 InsightAgent 类，独立 LLM pass）

执行结果回灌给 LLM 生成最终回答。多轮对话时，`PlannerAgent.invokeStream(message, history)` 会从 `ChatMessage` 表重建 `BaseMessage[]`（包括历史 tool_calls 和 ToolMessage），确保 LLM 看到完整上下文。

`InsightAgent` 是独立 Agent 类，封装成 StructuredTool 后绑定到 Planner。`ToolResultContext` 服务在 LLM 没传 data 时自动从最近工具结果兜底。

详见 [架构设计](./docs/architecture/SYSTEM.md)、[多轮对话 UI 增强](./docs/development/MULTI_TURN_DIALOGUE.md) 和 [Agent 增强记录 (2026-07-04)](./docs/development/2026-07-04_AGENT_ENHANCEMENTS.md)。

## Development Phases

| Phase | 状态 | 描述 |
|-------|------|------|
| Phase 1-5 | ✅ | 骨架、数据契约、Agent 链路、SSE、前端 UI |
| Phase 6 | ✅ | Docker 化 (4 服务编排) |
| Phase 7 | ✅ | 企业级 UI (深浅主题/LLM 摘要/DataTable) |
| Phase 8 | ✅ | LLM Settings 修复 |
| Phase 9 | ✅ | 流式输出 (token-by-token) + Provider 修复 |
| Phase 11 | ✅ | 数据层重构：Kysely / Superstore CSV / Planner & Tools 完善 |
| Refactor | ✅ | Planner + Function Calling 架构重构 |
| **Multi-Turn** | ✅ | **多轮次对话持久化 + 侧栏 UI + Welcome + Toast + 停止按钮 + 折叠** |
| **Agent 增强** | ✅ | **query_details (明细/Top-N/利润) + InsightAgent (商业洞察) + ChartAgent 重绑 + 数据中英修复** |
| **Sprint 5.5** | ✅ | **清理遗留 Superstore 表 + 删除废弃工具(query_sales/dimensions) + 主数据库只存元数据** |
| **Sprint 5.6** | ✅ | **CSV 流式 PG 入库 + 数据库连接表单 + 多数据源管理 + 多租户鉴权** |
| **Sprint 5.7** | ✅ | **语义推断(LLM 中文别名) + 端到端中文映射闭环 + 预览 AI 别名 + 表格导出/日期格式化 + 美国地图 + 深度思考 UI + 洞察重构** |

详细记录见 [docs/development/REFACTOR.md](./docs/development/REFACTOR.md) 和 [docs/development/MULTI_TURN_DIALOGUE.md](./docs/development/MULTI_TURN_DIALOGUE.md)。

## 前端关键能力

- **多轮对话侧栏**：280px / 56px / 抽屉三态，localStorage 记忆
- **多轮 tool_calls 重放**：修复 3 个后端 Bug（列名错配 / JSONB 对象形态 / `ToolMessage.name` 缺失）
- **Gemini 风格欢迎页**：首次进入显示大标题 + 副标题 + 推荐问题 chips
- **Toast 系统**：成功/失败/信息 3 类自动消失
- **发送 → 停止按钮**：流式生成时可点击中止
- **响应式**：移动端用 vaul Drawer

## Documentation

- [项目文档](./docs/README.md)
- [架构设计](./docs/architecture/SYSTEM.md)
- [API 接口](./docs/api/API.md)
- [数据契约](./docs/api/CONTRACTS.md)
- [开发指南](./docs/guides/SETUP.md)
- [调试指南](./docs/guides/DEBUG.md)
- [配置说明](./docs/guides/CONFIG.md)
- [Docker 部署](./docs/guides/DOCKER.md)
- [多轮对话 UI 增强](./docs/development/MULTI_TURN_DIALOGUE.md)

## Docker 快速启动

```bash
# 准备 .env
cp .env.example .env

# 构建并启动全部服务
pnpm docker:build
pnpm docker:up

# 在前端 Settings 页面配置 LLM API Key（OpenAI / Anthropic）

# 浏览器访问
open http://localhost:8080
```

详见 [Docker 部署指南](./docs/guides/DOCKER.md)。

---

## 详细架构说明书

> 本章节是项目从用户问题到返回结果的完整端到端说明,适合新人快速理解项目全貌。如需更深入的设计动机,参考 `docs/architecture/SYSTEM.md` 和 `docs/development/` 下的开发日志。

### 1. 项目定位

基于 LLM Function Calling 的通用多数据源智能数据分析平台。用户用中文/英文提问,Planner LLM 拆解意图 → QueryGateway 透传 SQL 到外部数据源 → 图表工具可视化 → 洞察工具给商业分析 → 通过 SSE 流式返回富文本(文字 + 图表 + 表格 + 洞察卡片)回答。

主数据库(PostgreSQL)只存平台元数据(User/DataSource/ChatSession/ChatMessage/LLMConfig)。业务数据全部通过外部 DataSource(Postgres/MySQL/DuckDB-CSV)接入,元数据驱动,零硬编码。

### 2. 整体架构

```
┌─────────────────────────┐         ┌────────────────────────────────────────┐
│  apps/web (浏览器)      │  HTTPS  │  apps/server (NestJS @ :3000)          │
│  React 18 + Vite        │ ──────▶ │  ┌──────────────────────────────────┐  │
│  Zustand (state)        │         │  │ ChatController (REST + SSE)      │  │
│  ECharts 5.x            │ ◀─────  │  └────────────┬─────────────────────┘  │
│  SSE 客户端 (fetch)     │   SSE   │               ▼                         │
│  Tailwind + CSS 变量    │         │  ┌──────────────────────────────────┐  │
│  Shadcn UI (Radix+vaul) │         │  │ ChatService                      │  │
└─────────────────────────┘         │  │  └─ PlannerAgent (ReAct loop)    │  │
                                    │  │     bindTools([4 tools])         │  │
                                    │  │     + ToolResultContext          │  │
                                    │  └────────────┬─────────────────────┘  │
                                    │               ▼                         │
                                    │  ┌──────────────────────────────────┐  │
                                    │  │ 4 Function-Calling Tools         │  │
                                    │  │  • query_details (通用聚合)      │  │
                                    │  │  • gen_chart (SQL+Intent→Option) │  │
                                    │  │  • generate_insight (InsightAgent)│ │
                                    │  │  • get_table_schema (动态Schema) │  │
                                    │  └────────────┬─────────────────────┘  │
                                    │               ▼                         │
                                    │  ┌──────────────────────────────────┐  │
                                    │  │ LlmService                       │  │
                                    │  │  • ChatOpenAI / ChatAnthropic    │  │
                                    │  │  • invokeStructured<T> (Zod)     │  │
                                    │  │  • Thinking mode (qwen3/o1)      │  │
                                    │  └────────────┬─────────────────────┘  │
                                    └───────────────┼─────────────────────────┘
                                                    ▼
                                    ┌────────────────────────────────────────┐
                                    │ PostgreSQL 16                          │
                                    │  • Prisma schema (单一来源)           │
                                    │  • Kysely 运行时 query builder         │
                                    │  • JSONB 存 tool_calls / tool_results  │
                                    └────────────────────────────────────────┘
```

### 3. 端到端数据流 — "用蓝绿色画出各地区销售额"

**Step 1 (前端 - 输入)**: 用户在 `ChatInput` 输入文本 → Enter 触发 `onSend` → `useChatActions.sendInCurrentSession`。

**Step 2 (前端 - 本地状态)**: 若 `currentSessionId` 不存在,先 `POST /chat/sessions` 创建会话,获得 sessionId。store 推入用户消息 + 助手占位消息(`content: ""`, `isFinal: false`)。

**Step 3 (前端 - SSE)**: `useSSEChat.sendMessage` 构造 URL `${VITE_API_BASE_URL}/chat/stream?message=...&sessionId=...`,用 `eventsource-parser` 流式解析。

**Step 4 (后端 - 入口)**: `ChatController.streamChat` 进入 `runWithTrace({traceId, sessionId, ...})`,调用 `ChatService.streamChat`。

**Step 5 (后端 - Planner)**: `PlannerAgent.invokeStream(message, history, {sessionId, signal})`:
- `buildSystemPrompt()` 拼接工具描述 + 数据库 schema + 规则
- 从 `ChatMessage` 表 JSONB 字段重建 `BaseMessage[]` 历史(含历史 `AIMessage.tool_calls` 和 `ToolMessage`)
- `getChatModel()` 返回 `ChatOpenAI` / `ChatAnthropic`,`bindTools([4 tools])` 注入 function calling
- while 循环:`for await (chunk of stream)` → yield `text` SSE 事件(token-by-token)

**Step 6 (LLM 决定调工具)**: LLM 输出 `tool_calls: [{name: "gen_chart", args: {chartType: "bar", groupBy: "region", colorPalette: ["#00ffff"]}}]` → SSE `tool_call` 事件。

**Step 7 (后端 - gen_chart 工具执行)**:
1. Kysely 拼 SQL:`SELECT region as name, SUM(sales) as sales FROM SalesOrderItem ... GROUP BY region ORDER BY sales DESC LIMIT 1000`
2. 转 `rows: Array<{name, sales}>`
3. `chartAgent.extractIntent(rows, message, ctx)`:
   - 截断数据到 Top 100 (`DATA_TRUNCATE_THRESHOLD`)
   - 构造 human message:`用户问题 + 数据样本前 8 条 + ctx (含 Planner 显式 colorPalette)`
   - 调 `llm.invokeStructured<ChartIntent>` 让 inner LLM 提取 chartType / xField / yField
   - `fillIntentFields` 用 ctx 兜底缺失字段,**Planner 显式字段(explicitColorPalette)优先级最高**
   - 失败 → `intentFallback` 关键词兜底
4. `chartHelper.assemble(intent, rows)`:
   - dispatch switch intent.chartType → `assembleXY(intent, rows, ctx, "bar")`
   - 返回 `EChartsOption` 后,**顶层注入 `option.color = ["#00ffff"]`** (来自 colorPalette)
5. 返回 `{chart, chartType, chartSource, intent, rows, metrics, metricLabels}` → SSE `tool_result` 事件

**Step 8 (LLM 继续生成回答)**: LLM 看到 tool_result → 生成"已为您用蓝绿色绘制各地区销售额柱状图,数据显示华东销售最高..." → SSE `text` 事件。

**Step 9 (SSE done)**: 流结束,服务端 `yield {type: "done"}`。

**Step 10 (后端 - 持久化)**: `ChatService` 把 assistant 消息 + `metadata.toolCalls[]` + `metadata.toolResults[]` 存入 `ChatMessage` 表(JSONB 字段)。

**Step 11 (前端 - 渲染)**:
- `useSSEChat.dispatch("tool_result")` → `updateLastAssistant` 把 toolResult 推入 `toolResults[]`
- `MessageBubble` 渲染 `gen_chart` 分支:
  - 读 `intent.layout` → 如果 fullscreen,容器加 `w-full` 类
  - 读 `intent.mapType` → 透传给 `DynamicChart.mapType`
  - `ChartWithFallback` 包 `ChartErrorBoundary(fallbackRows=rows)`
  - `DynamicChart`:
    - `collectSeriesTypes(option)` → 识别 chart 类型
    - 若含 `map` → `ensureMap(intent.mapType)` fetch GeoJSON + registerMap
    - 若含 `bar3D` → `ensureEchartsGL` dynamic import
    - `isLoading=true` 显示 "正在加载图表资源..."
    - 完成后 `ReactECharts` 渲染,`theme={isDark ? "dark" : "light"}`
    - 500ms 后 `onChartReady` 跑 Canvas 像素探针:空白率 ≥ 95% → onError → Boundary 渲染 fallbackRows 表格

**Step 12 (前端 - 流式文本)**: `text` 事件持续推入,`MessageBubble` 用 `ReactMarkdown` 渲染流式 Markdown(末尾带光标 `▋`)。

**Step 13 (前端 - 完成)**: `done` 事件 → `isFinal=true`,`scrollToBottom()`,推荐追问 chips 出现(`<DynamicSuggestions>`)。

### 4. 后端文件清单

```
apps/server/src/
├── main.ts                          # NestJS bootstrap + cors + validation pipe + 端口 3000
├── app.module.ts                    # 根模块,imports ChatModule + DatabaseModule
├── modules/
│   ├── chat/
│   │   ├── chat.module.ts           # 注册 ChatController + ChatService
│   │   ├── chat.controller.ts       # REST 端点 + SSE streamChat (AsyncLocalStorage traceId 注入)
│   │   └── chat.service.ts          # streamChat 方法,编排 PlannerAgent + 持久化
│   ├── ai/
│   │   ├── ai.module.ts             # 注入 PlannerAgent / ChartHelper / ChartAgent / InsightAgent / LlmService
│   │   ├── agents/
│   │   │   ├── planner.agent.ts     # PlannerAgent (ReAct loop):invokeStream / buildSystemPrompt / retry safeguard
│   │   │   ├── chart.agent.ts       # ChartAgent V2:extractIntent + intentFallback + fillIntentFields
│   │   │   └── insight.agent.ts     # InsightAgent (Agent-as-a-Tool,独立 LLM pass)
│   │   ├── llm/
│   │   │   ├── llm.service.ts       # LlmService:getChatModel / invokeStructured<T> / parseAndValidate
│   │   │   └── thinking-chat-openai.ts  # OpenAI thinking mode 适配 (qwen3/deepseek-r1/o1)
│   │   ├── tools/
│   │   │   ├── index.ts             # 导出 createGenChartTool / createQueryDetailsTool / createGenerateInsightTool / createGetTableSchemaTool
│   │   │   ├── schemas.ts           # Zod schema:GenChartArgsSchema / QueryDetailsArgsSchema / GenerateInsightArgsSchema / ChartIntentSchema
│   │   │   ├── query-details.tool.ts # 元数据驱动通用聚合 + 明细/Top-N,不再硬编码维度
│   │   │   ├── gen-chart.tool.ts    # SQL→extractIntent→assemble 三段式 + try/catch ChartAssembleError 降级
│   │   │   ├── generate-insight.tool.ts # 包装 InsightAgent,data 从 ToolResultContext 兜底
│   │   │   ├── get-table-schema.tool.ts # 动态取某张表的完整 schema (LLM 按需调用)
│   │   │   ├── chart.helper.ts      # ChartAssembler:26 chartType 硬编码装配 (GUARD-V2-2 零 try/catch 修复)
│   │   │   ├── metric-labels.ts     # MetricKey + METRIC_LABELS (Sprint 5.5 从 dimensions.ts 提取)
│   │   ├── field-mapping.ts      # [Sprint 5.7] buildFieldMapping() 物理名→中文名映射
│   │   │   └── tool-result.context.ts # AsyncLocalStorage 跨工具 data 兜底
│   │   └── debug-log.ts             # TraceLogger + AsyncLocalStorage traceId + 16 个 ChartPhase
│   └── database/
│       ├── database.module.ts       # Kysely provider + PrismaClient
│       └── database.service.ts      # getSchema() + db 字段 (Kysely 实例)
├── prisma/
│   ├── schema.prisma                # 7 模型:User / DataSource / DataSourceSnapshot / ChatSession / ChatMessage / LLMConfig (Sprint 5.5 删除 4 张业务表)
│   ├── schema.sql                   # DDL 同步(可在 Docker entrypoint 直接 psql 执行)
│   ├── seed.ts                      # 空 stub (Sprint 5.5 精简,业务数据通过 DataSource 接入)
│   └── data/superstore_sales.csv    # 9,994 行销售原始数据(留作 CSV 上传演示)
└── package.json                     # NestJS + Kysely + Prisma + LangChain 依赖
```

### 5. 前端文件清单

```
apps/web/src/
├── main.tsx                         # React 18 入口 + StrictMode + echarts/theme/dark 副作用 import
├── App.tsx                          # 路由(/、/settings)+ Theme toggle (html.dark)+ ToastContainer
├── index.css                        # Tailwind + CSS 变量主题 (light/dark)+ 动画工具类
├── core/
│   ├── api/AxiosInstance.ts         # axios 实例,baseURL from VITE_API_BASE_URL,30s timeout
│   └── store/index.ts               # useAppStore:LLM config + health (跨页面)
├── components/
│   ├── ToastContainer.tsx           # 全局 toast 栈(右下角浮层,z-100)
│   └── ui/                          # 4 个 Shadcn 组件:button (CVA) / dialog (Radix) / drawer (vaul) / scroll-area
├── features/
│   ├── chat/
│   │   ├── ChatWindow.tsx           # 主聊天界面:header + quick commands + 消息列表 + input + error banner
│   │   ├── MessageBubble.tsx        # 单消息渲染(user / assistant / tool timeline / 图表 / 表格 / 洞察 / 追问)
│   │   ├── DynamicChart.tsx         # echarts-for-react 包装 + 加载态 + ResizeObserver + Canvas 像素探针 + dark 切换 remount
│   │   ├── ChartErrorBoundary.tsx   # ErrorBoundary + fallbackRows 表格降级 + reset 重试
│   │   ├── CollapsibleTable.tsx     # 可折叠表格(query_sales/details 结果,8 行阈值)
│   │   ├── InsightPanel.tsx         # 商业洞察卡片(severity icon + 标题 + 证据 chip + 建议行动)
│   │   ├── ChatInput.tsx            # 自动生长 textarea + 发送/停止按钮 + Enter 提交 + 字符计数
│   │   ├── WelcomeScreen.tsx        # 首次进入欢迎页 + 旋转问候 + 推荐问题 chips
│   │   ├── sidebar/                 # 8 个侧栏组件:SessionSidebar / CollapsedSidebar / MobileSidebarDrawer / SidebarHeader / NewChatButton / SessionList / SessionItem / SidebarToggle
│   │   ├── hooks/useSSEChat.ts      # SSE 客户端(eventsource-parser + retry/backoff [500, 1000, 2000])
│   │   ├── hooks/useChatActions.ts  # session 生命周期:load / select / new / delete / rename / sendInCurrentSession
│   │   ├── store/index.ts           # useChatStore:messages / theme / sessions / sidebar state
│   │   ├── store/persistence.ts     # localStorage 读写(sessions, currentId, sidebar, searchQuery)
│   │   ├── api.ts                   # chatSessionApi (axios CRUD)
│   │   └── types.ts                 # AssistantMessage / ToolResultData / SSE events
│   └── settings/SettingsPage.tsx    # LLM provider 配置(OpenAI/Anthropic + API key + base URL + model + temperature + 健康检查)
├── lib/
│   ├── echarts-setup.ts             # 扩展包按需加载:ensureEchartsGL / ensureLiquidFill / ensureWordCloud + collectSeriesTypes
│   ├── echarts-map-loader.ts        # 地图资源动态加载:Vite ?url → GEO_URLS → ensureMap(mapType) + registerMap
│   └── utils.ts                     # cn (clsx + tailwind-merge)
├── store/toast.ts                   # useToastStore + toast.success/error/info (3s 自动消失)
├── assets/maps/                     # GeoJSON:china.json(完整 570KB) + world.json / usa.json(占位)
└── types/                           # 类型重导出 + shims.d.ts (echarts-gl/liquidfill/wordcloud 无 @types)
```

### 6. 数据契约(关键 Zod schema 摘录)

```typescript
// GenChartArgsSchema (后端 Planner 工具入参) — M5-Patch 含样式/地图/布局
// [Sprint 5.5] 不再硬编码 region/category/timeRange 等业务枚举,完全元数据驱动
{
  dataSourceId: string,         // 数据源 id
  table: string,                // 表名 (从 MetadataSnapshot 选取)
  groupBy?: string[],           // 列名字符串数组
  metrics?: MetricSpec[],       // [{column, agg, alias, label}]
  chartType?: "line" | "bar" | "pie" | ..., // 27 种 + "area" 共 28
  topN?: 1-100,
  // [M5-Patch] Planner 显式透传的样式意图
  colorPalette?: string[],   // ["#800080"] 紫,["red"] 命名色
  mapType?: "china" | "world" | "usa" | "prov-<拼音>",
  layout?: "inline" | "fullscreen",
}

// ChartIntentSchema (V2 协议反转,inner LLM 输出) — LLM 仅输出最小意图
{
  chartType: <28 种之一>,
  xField: string,
  yField: string,
  groupBy?: 14 维度之一,
  metrics?: MetricKey[],
  colorPalette?: string[],     // M5-Patch
  mapType?: string,            // M5-Patch
  layout?: "inline" | "fullscreen",  // M5-Patch
}

// SSEToolResultDataSchema (前后端 SSE tool_result 通道)
{
  name: string,                  // 工具名:query_details / gen_chart / generate_insight / get_table_schema
  result: {
    sql?: string,
    rows?: Array<Record<string, any>>,
    chart?: EChartsOption,       // gen_chart 才有
    chartType?: string,
    chartSource?: "agent" | "fallback",
    metrics?: string[],
    metricLabels?: Record<string, string>,
    groupBy?: string,
    analysis?: string,
    rowCount?: number,
    reply?: string,
    error?: string,
    intent?: ChartIntentPayload, // M5-Patch 透传给前端
  },
}

// ChatMessageRequestSchema (REST 入参)
{ message: string (min 1), sessionId?: uuid }

// ChatSessionSchema
{ id: uuid, title?, userId?, createdAt, updatedAt }
```

### 7. 关键设计决策

1. **双层 DB (Prisma + Kysely)**:Prisma 单一 schema 来源(可视化建模 + 自动 migration),Kysely 运行时类型安全 query builder(gen-chart 工具内动态拼 SQL)。Kysely 0.29.x 提供 `db.selectFrom(...)` 流式 API,JOIN/GROUP BY 比 Prisma ORM 更灵活。

2. **Planner + Function Calling 替代 RouterAgent**:旧架构(Phase 1-10)用一个 Router LLM 单次分类用户意图 → 选一个工具;新架构(Multi-Turn 重构)用 LangChain `bindTools(4 tools)` 让 LLM 自主决定调什么、调几次、参数是什么(ReAct loop)。优势:支持"先 query_details 拿数据,再 generate_insight 分析"的链式调用。

3. **SSE 而非 WebSocket**:单向流(LLM → 用户)+ 简单 HTTP/1.1 兼容 + nginx 反代一行配置即可(`proxy_buffering off`)。WebSocket 双向能力用不上,反而引入复杂度。

4. **ChartAgent V2 协议反转 (M13)**:旧版让 LLM 直接生成完整 EChartsOption JSON,实战暴露 3 大问题 — 静默失败(LLM 生成缺字段的桑基图,ECharts 画空 Canvas 不报错)、防御代码膨胀(jsonrepair / autoFixChartOption 7 类修复 / 幻觉检测 / 体积护栏)、UX 不稳定(同样 prompt 多次执行结果不一致)。V2 改为 LLM 只输出意图 JSON `{chartType, xField, yField, groupBy, metrics}`,后端 100% 确定性装配 26 类硬编码。代码量净减约 470 行,装配确定性 100%。

5. **JSONB 存 tool_calls / tool_results**:LangChain `BaseMessage[]` 重建要求 `AIMessage` 含 `tool_calls` + 对应 `ToolMessage.tool_call_id`。直接用 `ChatMessage.metadata` JSONB 字段存这些结构化数据,比拆多张表 join 快得多。前端 `recordToChatMessage` 反序列化时复原 `toolCalls[]` / `toolResults[]` 数组。

6. **chart-validator.ts 删除 (V2 重构)**:M1-M6 期间维护了一个 `ChartValidator.validate(chart)` 类做 LLM 输出后置校验(系列类型白名单、3D 系列必含 grid3D、>200KB 截断、幻觉检测)。V2 协议反转后,LLM 不再输出 EChartsOption,校验对象不存在,该文件及 `HallucinationError` 类整文件删除,L2 自动修复机制随之废弃。

7. **M5-Patch 地图 `?url` 静态 import**:初版用 `import(\`../assets/maps/${mapType}.json\`)` 动态模板,Vite 无法解析运行时变量,build 后 `dist/assets/` 不包含 GeoJSON(生产 404)。改用静态 import map + `?url` 后,Vite 强制把每个 GeoJSON 发射为独立 chunk(`china-CxOP5e91.json` 197KB gzip),首屏不下载,首次使用时 fetch + registerMap,浏览器强缓存复用。

8. **[Sprint 5.5] 主数据库纯净**:删除 4 张遗留业务表(Customer/Product/SalesOrder/SalesOrderItem),主数据库只存平台元数据。删除 `query-sales.tool.ts`(已由 query_details 覆盖)和 `dimensions.ts`(硬编码 Superstore SQL builder),提取通用 `metric-labels.ts`。删除 `DatasourceSeed`,用户自行通过 UI 接入数据源。

### 8. 调试与观测

- **TraceLogger** (`apps/server/src/modules/ai/debug-log.ts`):AsyncLocalStorage 注入 `traceId` + `sessionId` + `userMessage` + `startTs`,16 个 `ChartPhase` 阶段(controller-entry / planner-invoke / sql-execute / chart-agent / chart-assemble / llm-invoke / zod-fail / fallback / tool-result / sse-error 等)。
- **CHART_DEBUG=1 环境变量**:开启后 TraceLogger dump 完整 payload(raw LLM 输出 / raw rows / SQL 结果前 5 行 / chart option),默认关(生产低开销)。
- **SSE error event 带 traceId**:后端 `chat.service.ts` 的 error 事件含 `traceId`,前端 `useSSEChat` 收到时 `console.error("[SSE error]", e)`,客服可凭 traceId grep 服务端日志定位问题。
- **Canvas 像素探针 (GUARD-V2-3)**:DynamicChart 500ms 后采样 Canvas,空白率 ≥ 95% → `onError(new Error('[GUARD-V2-3] Canvas 空白率 N% ≥ 95%'))`,Boundary 接住并渲染 fallbackRows 表格。

### 9. 部署拓扑

| 场景 | 服务端口 | 备注 |
|---|---|---|
| 本地开发 | postgres:5432 + server:3000 + web:5173 (Vite HMR) | 三个独立 dev 进程 |
| Docker compose | postgres:5432 + server:3000 + web:80 (nginx 反代 server) | nginx `proxy_buffering off` 让 `/chat/` `/ai/` 路径 SSE 不被缓冲 |
| Vercel | 仅 web (静态部署) | server 需独立部署(Render / Fly.io / Railway),`VITE_API_BASE_URL` 设为绝对 URL |
| 生产 LLM 密钥 | 不进 .env,前端 Settings → `POST /llm/config` → DB LLMConfig 表 | 密钥不出服务器,可运行时轮换 |

---

## 项目当前阶段(Sprint 5.7)

最近一次重要提交: Sprint 5.7 — 语义推断 + 端到端中文映射 + 预览 AI 别名 + 表格导出/日期格式化 + 美国地图 + 深度思考 UI。

### Sprint 5.7 核心能力

- **LLM 语义推断**: 注册数据源时自动推断中文别名(chineseName/role/description),预览阶段可手动修改
- **全链路中文化**: Prompt 注入中文 schema → 物理名隔离(防 LLM 漂移) → 前端图表/表格自动显示中文
- **预览 AI 别名**: POST /upload/preview/aliases 新端点,预览弹窗自动生成可编辑中文别名
- **别名优先级**: 用户确认 alias > LLM 推断 chineseName > 物理名
- **增强 prompt**: `buildSystemPrompt()` 注入中文化 schema 格式 `emp_name (员工姓名)`
- **物理名隔离**: `remapChineseToPhysical()` 在 QueryGateway 前自动转换误用的中文名
- **ChartTrace 修复**: `invokeStream()` 强制 dataSourceId 校验 + snapshot 预热,杜绝盲猜
- **洞察修复**: `GenerateInsightArgsSchema` 增加 sessionId 字段,修复 Zod strip 导致兜底失效;`previewData()` 改为表格格式;insights[].min(2→1)
- **表格导出 CSV**: BOM+UTF-8 中文表头,逗号/引号安全转义
- **日期格式化**: `formatCellValue()` 公共方法,ISO→YYYY/MM/DD,表格+图表统一
- **美国地图**: 52 州真实 GeoJSON(89KB gzip 29KB),visualMap 色阶+hover 高亮
- **用户消息按钮**: 编辑(回填输入框)/复制/重试
- **AI 回复按钮**: 复制
- **DataSourcePicker 响应式修复**: `getState()` → Zustand hook 订阅
- **PG 内省修复**: PK/FK 查询 `table_name` 歧义限定为 `tc.table_name`
- **ColumnNameSchema 放宽**: 去掉 ASCII-only regex,允许 LLM 输出中文名

- 主数据库只存平台元数据(User/DataSource/ChatSession/ChatMessage/LLMConfig)
- 业务数据 100% 通过外部 DataSource 接入(Postgres/MySQL/DuckDB-CSV)
- PlannerAgent 绑定 4 工具:query_details / gen_chart / generate_insight / get_table_schema
- 元数据驱动:LLM 看到的 schema 来自 MetadataSnapshot,零硬编码
- 26 类 ECharts 系列硬编码装配(确定性)
- 4 种地图(中国完整 + 世界/美国/省份占位),按需 dynamic chunk 加载
- 全屏布局(`layout: 'fullscreen'`) + 用户自定义颜色
- 错误兜底三层:组件级 ErrorBoundary + Canvas 像素探针 + 表格降级
- 多租户鉴权(User/JWT/row-level ownership)

如需新增能力(如新图表类型、新地图资源、新 LLM provider),参考 `docs/development/` 下的开发日志风格,新增 commit 时使用 `feat/fix/refactor/style` 前缀。

---

## 已知限制

- 暂不支持 DeepSeek-R1 / o1 / Qwen3 等思考模型的 reasoning_content 透传（thinking 相关代码已在 Fix-4 清理，见 `docs/implementation/fix-4-cleanup-tests.md` Task 4.1）
- 3D 图表（bar3D / scatter3D / surface3D / line3D / points3D / lines3D）暂不支持，统一抛 `ChartAssembleError`（Fix-4 Task 4.3）
- 项目仓库无根 `eslint.config.*` / `.eslintrc.*` — `pnpm lint` 在 apps/server 找不到配置会报错（仓库基线现状，不影响 build）