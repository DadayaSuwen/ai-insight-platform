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

# Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:8b

# Server
PORT=3000
```

### 4. 启动数据库

```bash
docker-compose up -d postgres
```

### 5. 初始化数据库

```bash
cd apps/server
pnpm prisma generate
pnpm prisma db push
pnpm ts-node prisma/seed.ts
```

### 6. 启动开发服务器

```bash
# 终端 1: 后端
cd apps/server && pnpm dev

# 终端 2: 前端
cd apps/web && pnpm dev
```

## 常用命令

### 后端

```bash
cd apps/server
pnpm dev          # 开发模式
pnpm build        # 构建
pnpm prisma studio # Prisma 管理界面
```

### 前端

```bash
cd apps/web
pnpm dev          # 开发模式
pnpm build        # 构建
pnpm preview     # 预览构建结果
```

### Monorepo

```bash
pnpm build        # 构建所有项目
pnpm dev        # 开发模式
pnpm lint       # 代码检查
```

## 代码规范

- 使用 TypeScript strict 模式
- ESLint + Prettier
- 提交前运行 `pnpm lint`

## 测试

```bash
cd apps/server
pnpm test        # 单元测试
```

## Docker 构建

```bash
# 构建镜像
docker build -f .docker/Dockerfile.web -t ai-insight-web .
docker build -f .docker/Dockerfile.server -t ai-insight-server .

# 运行
docker-compose up -d
```