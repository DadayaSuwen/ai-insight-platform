# AI Insight Platform

## Project Overview

AI Insight Platform 是一个基于 AI 的数据分析平台，支持自然语言查询、数据可视化和智能分析报告生成。

## Tech Stack

- **Frontend**: React 18 + Vite + Zustand + TailwindCSS + Shadcn UI（Radix + vaul + cva + lucide）+ ECharts
- **Backend**: NestJS + Kysely（运行时）/ Prisma（schema 定义）
- **AI**: LangChain.js（`@langchain/core/messages`）+ Ollama（qwen3:8b / qwen2.5:3b）
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
| `pnpm docker:up` | 后台启动全部 Docker 服务（postgres + ollama + server + web） |
| `pnpm docker:down` | 停止并移除容器（保留卷） |
| `pnpm docker:logs` | 跟踪所有容器日志 |
| `pnpm docker:reset` | 销毁卷并重新启动 |
| `pnpm docker:rebuild` | 不缓存重建镜像 |
| `pnpm docker:seed` | 在运行中的 server 容器内手动执行 seed |
| `pnpm docker:infra` | 仅启动 postgres + ollama |
| `pnpm docker:rebuild` | 不缓存重建镜像 |

## Environment Variables

### apps/server/.env
```bash
DATABASE_URL=postgresql://app:password@localhost:5432/ai_insight
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:3b
PORT=3000
```

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

> SQL / Chart / Analysis 数据全部走 `tool_result` 通道，没有独立的 `sql` / `chart` / `analysis` 事件。

## Architecture

**Planner + Function Calling**：LLM 通过 `bindTools` 调用工具（`query_sales` / `gen_chart`），执行结果回灌给 LLM 生成最终回答。多轮对话时，`PlannerAgent.invokeStream(message, history)` 会从 `ChatMessage` 表重建 `BaseMessage[]`（包括历史 tool_calls 和 ToolMessage），确保 LLM 看到完整上下文。

详见 [架构设计](./docs/architecture/SYSTEM.md) 和 [多轮对话 UI 增强](./docs/development/MULTI_TURN_DIALOGUE.md)。

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

# 拉取 Ollama 模型（首次）
docker compose exec ollama ollama pull qwen2.5:3b

# 浏览器访问
open http://localhost:8080
```

详见 [Docker 部署指南](./docs/guides/DOCKER.md)。