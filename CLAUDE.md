# AI Insight Platform

## Project Overview

AI Insight Platform 是一个基于 AI 的数据分析平台，支持自然语言查询、数据可视化和智能分析报告生成。

## Tech Stack

- **Frontend**: React 18 + Vite + Zustand + TailwindCSS + Shadcn UI + ECharts
- **Backend**: NestJS + Prisma ORM
- **AI**: LangChain.js + Ollama (qwen3:8b)
- **Database**: PostgreSQL 16
- **Monorepo**: Turborepo + pnpm

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
OLLAMA_MODEL=qwen3:8b
PORT=3000
```

### apps/web/.env
```bash
VITE_API_BASE_URL=http://localhost:3000
```

## API Endpoints

| Method | Endpoint | Description |
|-------|----------|-------------|
| POST | /chat/message | 发送聊天消息 |
| POST | /database/query | 执行 SQL 查询 |
| GET | /database/schema | 获取数据库 schema |
| POST | /ai/process | 处理 AI 消息 |

## SSE Events

流式响应事件类型：

| Event | Description |
|-------|-------------|
| token | 普通文字流（自然语言摘要） |
| sql | 生成的 SQL + 原始数据行（DataTable 渲染） |
| chart | 图表配置 |
| analysis | 分析报告 |
| error | 错误信息 |
| done | 结束标志 |

## Development Phases

1. **Phase 1: 骨架搭建** ✅ 完成
2. **Phase 2: 数据契约定义** ✅ 完成
3. **Phase 3: Agent 链路开发** ✅ 完成 (51 测试通过)
4. **Phase 4: SSE 流式输出** ✅ 完成 (58 测试通过)
5. **Phase 5: 前端 UI 对接** ✅ 完成
6. **Phase 6: Docker 化** ✅ 完成 (11 个 bug 修复，4 服务编排)
7. **Phase 7: 企业级 UI + SQL 结果增强** ✅ 完成 (流式光标/快捷指令/深浅主题/LLM 摘要/DataTable)

## Documentation

- [项目文档](./docs/README.md)
- [架构设计](./docs/architecture/SYSTEM.md)
- [API 接口](./docs/api/API.md)
- [数据契约](./docs/api/CONTRACTS.md)
- [开发指南](./docs/guides/SETUP.md)
- [调试指南](./docs/guides/DEBUG.md)
- [配置说明](./docs/guides/CONFIG.md)
- [Docker 部署](./docs/guides/DOCKER.md)

## Docker 快速启动

```bash
# 准备 .env
cp .env.example .env

# 构建并启动全部服务
pnpm docker:build
pnpm docker:up

# 拉取 Ollama 模型（首次）
docker compose exec ollama ollama pull qwen3:8b

# 浏览器访问
open http://localhost:8080
```

详见 [Docker 部署指南](./docs/guides/DOCKER.md)。