# 开发指南

## 环境要求

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose
- PostgreSQL 16 (可选，使用 Docker)

## 开发环境设置

### 1. 克隆项目

```bash
git clone <repository-url>
cd ai-insight-platform
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 配置环境变量

复制 `.env.example` 到 `.env` 并根据需要修改：

```bash
# 数据库
DATABASE_URL=postgresql://app:password@localhost:5432/ai_insight

# Ollama (LLM 提供方)
OLLAMA_BASE_URL=http://localhost:11434
# 推荐 qwen2.5:3b (响应 ~1s); qwen3:8b 准确度更高但慢 (28s+)
OLLAMA_MODEL=qwen2.5:3b

# Server
PORT=3000
```

> **模型选择**: `qwen2.5:3b` 是当前的默认,体积小(~2GB)、响应快(1-3s),适合开发期高频迭代; `qwen3:8b` (~5GB) 在 4-way 意图分类和复杂 SQL 上更稳,但单次响应 20-30s。生产环境可根据硬件条件切换。

### 4. 启动数据库

```bash
docker-compose up -d postgres
```

### 5. 启动 Ollama (LLM 提供方)

```bash
# Docker 方式 (推荐)
docker-compose up -d ollama

# 拉取模型 (默认 qwen2.5:3b,体积小,启动快)
docker exec ai-insight-platform-ollama-1 ollama pull qwen2.5:3b

# 验证模型可用
curl http://localhost:11434/api/tags
```

### 6. 初始化数据库

```bash
# 一键完成: 生成 Prisma Client + 推送 schema + 写入种子数据
pnpm db:seed
```

### 7. 启动开发服务器

```bash
# 同时启动前后端 (推荐)
pnpm dev:all

# 或分开启动
pnpm dev:server   # 后端 (NestJS, 端口 3000)
pnpm dev:web      # 前端 (Vite, 端口 5173)
```

## 常用命令

> 所有命令都在**仓库根目录**执行,使用 pnpm workspace 过滤。

### Monorepo 一键脚本

| 命令 | 说明 |
|------|------|
| `pnpm dev:all` | 同时启动前后端 (Turborepo) |
| `pnpm dev:web` | 仅启动前端 |
| `pnpm dev:server` | 仅启动后端 |
| `pnpm build` | 构建所有项目 |
| `pnpm lint` | 全量 ESLint 检查 |
| `pnpm db:up` | 启动 PostgreSQL 容器 |
| `pnpm db:seed` | 初始化数据库 (push + seed) |
| `pnpm db:studio` | 打开 Prisma Studio |

### 后端 (进入 apps/server 后)

```bash
pnpm dev              # 开发模式 (热重载)
pnpm build            # 构建生产产物
pnpm start            # 启动已构建的产物
pnpm test             # 单元测试
pnpm prisma studio    # Prisma 管理界面
```

### 前端 (进入 apps/web 后)

```bash
pnpm dev              # 开发模式 (Vite HMR)
pnpm build            # 生产构建
pnpm preview          # 预览构建结果
```

### 测试

| 命令 | 说明 |
|------|------|
| `pnpm test` | 运行所有项目测试 (Turborepo) |
| `pnpm test:server` | 仅运行后端测试 (Jest) |
| `pnpm test:watch` | 监听模式 (后端) |
| `pnpm test:coverage` | 测试覆盖率 (后端) |

## 代码规范

- 使用 TypeScript strict 模式
- ESLint + Prettier
- 提交前运行 `pnpm lint`

## Docker 构建

详见 [DOCKER.md](./DOCKER.md)。

```bash
# 一键启动全部服务
pnpm docker:up

# 浏览器打开 http://localhost:8080
```