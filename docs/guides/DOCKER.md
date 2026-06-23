# Docker 部署指南

本文档介绍如何用 Docker Compose 启动完整的 AI Insight Platform 栈（PostgreSQL + Ollama + NestJS 后端 + React/Vite 前端）。

## 架构

```
浏览器
  │  http://localhost:8080
  ▼
┌─────────────────────────┐
│  ai-web (nginx:alpine)  │  反代 /chat /ai /database 到 ai-server
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  ai-server (node:20)    │  NestJS + Prisma + LangChain
│  entrypoint:            │
│   wait postgres         │
│   prisma db push        │
│   ts-node seed          │
│   node dist/main.js     │
└────┬─────────────────┬──┘
     │                 │
     ▼                 ▼
┌──────────┐    ┌───────────┐
│ ai-      │    │ ai-       │
│ postgres │    │ ollama    │
│ :16      │    │ :latest   │
└──────────┘    └───────────┘
```

容器名即 DNS 名（`postgres`、`ollama`、`server`、`web`），可互相解析。

## 一键启动

```bash
# 1. 准备 .env（可选，默认值见下方）
cp .env.example .env

# 2. 构建并启动所有服务
pnpm docker:build
pnpm docker:up

# 3. 拉取 Ollama 模型（首次需要）
docker compose exec ollama ollama pull qwen3:8b

# 4. 浏览器打开 http://localhost:8080
```

## 端口约定

| 服务 | 宿主机端口 | 容器端口 | 说明 |
|---|---|---|---|
| web (nginx) | **8080** | 80 | 前端入口 |
| server (Node) | 3000 | 3000 | NestJS API（开发时直接访问） |
| postgres | 5432 | 5432 | 数据库 |
| ollama | 11434 | 11434 | LLM 推理服务 |

## 环境变量

在仓库根 `.env` 中配置（compose 通过 `${VAR:-default}` 引用）：

```bash
# LLM 模型（默认 qwen3:8b；开发常用 qwen2.5:3b）
OLLAMA_MODEL=qwen3:8b

# 前端允许跨域 origin（多个用逗号分隔，追加到默认白名单）
FRONTEND_ORIGIN=http://localhost:8080

# 是否在 server 启动时自动执行 seed（默认 true；生产建议 false）
SEED_ON_BOOT=true
```

server 容器在 `depends_on` 中等待 `postgres healthy` 与 `ollama healthy` 才启动。

## 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm docker:build` | 构建 server/web 镜像 |
| `pnpm docker:up` | 后台启动全部 4 个服务 |
| `pnpm docker:down` | 停止并移除容器（保留卷） |
| `pnpm docker:logs` | 跟踪所有服务日志 |
| `pnpm docker:logs server` | 只看 server 日志 |
| `pnpm docker:reset` | **销毁卷** + 重新启动（清空数据） |
| `pnpm docker:rebuild` | 不缓存重建镜像 + 重启 |
| `pnpm docker:seed` | 在运行中的 server 容器内手动执行 seed |
| `pnpm docker:infra` | 仅启动 postgres + ollama（不开 server/web） |

## 数据持久化

- PostgreSQL 数据 → `postgres_data` 卷
- Ollama 模型 → `ollama_data` 卷
- `pnpm docker:down` 不会删卷；`pnpm docker:reset` 会删

## 镜像大小参考

- `ai-insight-server`：约 400MB（含 node:20-alpine + 全部 node_modules + ts-node 用于 entrypoint）
- `ai-insight-web`：约 40MB（nginx:alpine + dist 静态资源）

## 故障排查

### 1. `OLLAMA_MODEL` 不一致导致行为异常
确认 `.env` 中设置的值与 `config.service.ts` 默认值一致。当前默认统一为 `qwen3:8b`。
```bash
docker compose exec server printenv OLLAMA_MODEL
```

### 2. `prisma generate` 失败 / query engine 缺失
`prisma generate` 在 build 阶段运行（**Debian bullseye 基础镜像**中验证通过）。如果失败：
```bash
docker compose build --no-cache server
docker compose logs server
```
确认 `node_modules/.prisma/client/` 在 server 镜像内存在。

### 3. SSE 流式响应不流（一次性返回）
检查 `.docker/nginx.conf` 中 `location ~ ^/(chat|ai)/` 的 `proxy_buffering off; proxy_cache off;` 配置存在。浏览器端确认使用 `EventSource`（fetch 流式也可能受 nginx 影响）。
```bash
curl -N -fsS -X POST http://localhost:8080/chat/stream \
  -H 'Content-Type: application/json' \
  -d '{"message":"hi"}'
```
`-N` 关闭 curl 缓冲，应看到流式输出。

### 4. CORS 报错
浏览器控制台报 CORS。检查 `apps/server/src/main.ts` 的白名单数组包含当前浏览器访问的 origin。Docker 部署默认包含 `http://localhost:8080`。自定义域名需通过 `FRONTEND_ORIGIN` 注入。

### 5. 首次启动 server 卡在 "waiting for postgres"
postgres healthcheck 超时（默认 100s）。检查 `docker compose logs postgres` 看 DB 是否正常初始化。

### 6. Ollama 拉模型超时
`qwen3:8b` 约 4.9GB，国内网络可能需要数分钟。失败可重试：
```bash
docker compose exec ollama ollama pull qwen3:8b
```

### 7. web 容器构建报 "Cannot find module '@workspace/types'"
`packages/types` 未构建。`Dockerfile.web` 的 build 阶段已先 `pnpm --filter @workspace/types build`，确认 logs 中该命令成功执行。

### 8. seed 报错但 server 仍启动
entrypoint 中 seed 失败仅 warning 不阻断启动（设计如此）。查看日志确认：
```bash
docker compose logs server | grep -E "seed|prisma"
```

## 关键设计决策（实施过程中的修正）

实施过程中偏离了原始方案的部分：

| 决策 | 原始方案 | 实际方案 | 原因 |
|---|---|---|---|
| 基础镜像 | `node:20-alpine` | `node:20-bullseye-slim`（Debian 11） | alpine 3.20+ 已移除 libssl.so.1.1，而 `@prisma/client` 5.x 的 native engine 仍依赖它；Debian bookworm 也已移除 libssl 1.1，只有 bullseye 仍有 |
| Schema 应用 | `prisma db push`（运行时） | `psql -f schema.sql`（运行时） | 同样的 openssl 问题：Prisma CLI 在 alpine 上无法启动 query engine |
| Schema 来源 | 运行时 `prisma migrate diff` 生成 | 预生成并提交到 `apps/server/prisma/schema.sql` | Prisma CLI 在 alpine 上失败；改为本地生成后 COPY 进镜像 |
| 镜像大小 | ~200MB（alpine） | ~455MB（bullseye + 全量 node_modules） | bullseye + glibc 比 alpine 大；为简化保留全量 devDependencies（含 ts-node） |

> 若未来 Prisma 升级到支持 openssl 3.x 的版本，可重新切换到 alpine 并恢复 `prisma db push`。

## 重新生成 schema.sql

如果 `prisma/schema.prisma` 变了：

```bash
# 在 host 上（Windows / macOS / Linux，Prisma CLI 可用即可）
cd apps/server
pnpm exec prisma migrate diff \
  --from-empty \
  --to-schema-datamodel ./prisma/schema.prisma \
  --script > prisma/schema.sql

# 重新构建 server 镜像
cd ../..
docker compose build server
```

## 切换到云端 API（待办）

未来若不再使用本地 Ollama，可：
1. 修改 `apps/server/src/modules/ai/llm/llm.service.ts` 替换 LangChain 的 ChatOllama 为 ChatOpenAI / ChatAnthropic
2. 从 `docker-compose.yml` 删除 `ollama` 服务
3. 从 server `depends_on` 删除 ollama
4. 新增 `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` 环境变量

## 不在本次范围

- 生产 HTTPS / 域名（需要 traefik 或云 LB）
- CI 自动 build & push 镜像
- 镜像扫描 / SBOM / 签名
- 多副本部署 / 负载均衡
- 备份与恢复策略