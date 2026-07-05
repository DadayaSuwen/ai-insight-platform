# 生产环境部署指南

本文档介绍如何把 AI Insight Platform 部署到公网演示环境。采用**混合架构**:Vercel 跑前端 SPA,Railway(或 Render)跑 NestJS 后端,Neon 提供 Serverless PostgreSQL。

> **为什么不把后端也部署到 Vercel?** SSE 流式接口(`/chat/stream`)默认 120s 超时,Vercel Serverless 单次请求最多 60s(Pro)/10s(Hobby);Prisma 在 Linux 运行时缺 `binaryTargets`;`pg.Pool` 在 serverless 冻结/解冻下会丢连接。改动成本高于收益,故保留 Docker 容器部署。

## 架构总览

```
┌─────────────────┐     HTTPS     ┌─────────────────────┐     TCP 5432   ┌──────────────┐
│  Vercel         │ ────────────► │  Railway / Render   │ ─────────────► │  Neon        │
│  apps/web       │   (CORS)      │  apps/server        │   (pg/SSL)    │  PostgreSQL  │
│  (Vite SPA)     │ ◄──────────── │  (NestJS Docker)    │ ◄─────────────│  (Serverless)│
└─────────────────┘   SSE/JSON    └─────────────────────┘     SQL         └──────────────┘
   VITE_API_BASE_URL                  FRONTEND_ORIGIN                DATABASE_URL
```

| 组件 | 平台 | 选型理由 |
|------|------|----------|
| 前端 SPA | **Vercel** | Vite 原生支持,自动 HTTPS、CDN、preview 域名 |
| 后端 API | **Railway** 或 **Render** | 已有 Dockerfile 复用,长连接/SSE 无限制 |
| 数据库 | **Neon** | 免费 0.5GB Serverless Postgres,与 Railway/Render 直连 |
| LLM Key | 运行时配置 | 通过前端 `/settings` 页面写入 `LLMConfig` 表 |

---

## 一、部署数据库 (Neon)

1. 注册 [neon.tech](https://neon.tech),新建项目 `ai-insight-platform`,选最近的 Region。
2. Dashboard → **SQL Editor** → 粘贴并执行 [`apps/server/prisma/schema.sql`](../../apps/server/prisma/schema.sql) 的内容。
3. Dashboard → **Connection Details** → 选 **Direct** → 复制完整连接串,保存备用:
   ```
  postgresql://neondb_owner:npg_Xb2PDHmaBi7Q@ep-fragrant-rice-aob25jqk-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```
   > 解析出 4 段备用:`host`(去掉端口)、`user`、`password`、`dbname`。

### Seed 数据

Neon SQL Editor 不方便跑 TS 文件。两种方式二选一:
   
**方式 A:本地临时起一个 docker 容器,反向往 Neon 灌 seed**

```bash
# 项目根目录,把 Neon 连接串导出
export DATABASE_URL='postgresql://neondb_owner:npg_Xb2PDHmaBi7Q@ep-fragrant-rice-aob25jqk-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'

# 把 Neon 的 host/user/password/dbname 拆给本地 postgres 容器做解析
export DATABASE_HOST='ep-fragrant-rice-aob25jqk-pooler.c-2.ap-southeast-1.aws.neon.tech'
export DB_USER='neondb_owner'
export DB_PASSWORD='npg_Xb2PDHmaBi7Q'
export DB_NAME='neondb'

# 起本地 server 容器,跳过 schema(Neon 已建好),只跑 seed
docker compose up -d postgres  # 仅起本地 pg 容器,作为 Prisma seed 解析 CSV 的载体
docker compose exec -e DATABASE_HOST=$DATABASE_HOST \
                    -e DB_USER=$DB_USER \
                    -e DB_PASSWORD=$DB_PASSWORD \
                    -e DB_NAME=$DB_NAME \
                    -e SEED_ON_BOOT=false \
                    server sh -c './node_modules/.bin/ts-node prisma/seed.ts'
```

**方式 B:用 `pg` Node 脚本直连 Neon**(如果不想启 docker)

```ts
// scripts/seed-neon.ts
import { Client } from 'pg';
import { spawn } from 'child_process';

const url = process.env.DATABASE_URL!;
// 直接 ts-node prisma/seed.ts 也能跑,只要 Prisma 用 Neon 连接串
spawn('pnpm', ['--filter', '@ai-insight/server', 'exec', 'ts-node', 'prisma/seed.ts'], {
  env: { ...process.env, DATABASE_URL: url },
  stdio: 'inherit',
});
```

执行完,Neon SQL Editor 跑 `SELECT count(*) FROM "Customer";` 应返回 > 0。

---

## 二、部署后端 (Railway / Render)

> Railway 与 Render 操作步骤几乎一样,任选其一。下面以 Railway 为例。

### Railway 部署步骤

1. 把仓库推到 GitHub(若还没推)。
2. https://railway.app → **New Project** → **Deploy from GitHub repo** → 选这个仓库。
3. Railway 默认检测到 `docker-compose.yml`。**忽略它**——我们只部署 server:
   - 右键刚创建的服务 → **Settings** → **Build**:
     - **Builder**: `4@#！2`
     - **Dockerfile Path**: `.docker/Dockerfile.server`
     - **Docker Build Context**: `.`(留空就是仓库根)
   - **Deploy** 区域:Start Command 留空(走 Dockerfile 的 `ENTRYPOINT`)。
4. **Variables** 面板添加:

   | 变量 | 值 | 说明 |
   |------|-----|------|
   | `DATABASE_HOST` | `ep-fragrant-rice-aob25jqk-pooler.c-2.ap-southeast-1.aws.neon.tech` | Neon host,去掉端口 |
   | `DATABASE_URL` | `postgresql://neondb_owner:npg_Xb2PDHmaBi7Q@ep-fragrant-rice-aob25jqk-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require` | `pg` 直连用 |
   | `DB_USER` | `neondb_owner` | Neon 用户名 |
   | `DB_PASSWORD` | `npg_Xb2PDHmaBi7Q` | Neon 密码 |
   | `DB_NAME` | `neondb` | 通常 `neondb` 或自定义 |
   | `PORT` | `3000` | |
   | `NODE_ENV` | `production` | |
   | `SEED_ON_BOOT` | `false` | 已经 seed 过,避免重启清表 |
   | `FRONTEND_ORIGIN` | 留空 → 后面填 Vercel 域名 | 逗号分隔多域名 |

5. **Settings** → **Networking** → **Generate Domain** → 得到 `https://<xxx>.up.railway.app`。
6. 验证后端:
   ```bash
   curl https://<xxx>.up.railway.app/database/schema
   # 期望:返回包含 ["Customer","Product","SalesOrder","SalesOrderItem","ChatSession","ChatMessage","LLMConfig"] 的 JSON 数组
   ```

### Render 部署步骤(可选替代)

1. https://render.com → **New +** → **Web Service** → 选 GitHub 仓库。
2. **Runtime**: `Docker`
3. **Dockerfile Path**: `.docker/Dockerfile.server`
4. **Docker Build Context Dir**: `.`
5. 其余 Variables 与 Railway 一致。

### 验证后端

```bash
# 1. Schema 端点
curl https://<backend-domain>/database/schema

# 2. 创建 session
curl -X POST https://<backend-domain>/chat/sessions

# 3. 健康检查(NestJS 默认 / 没有,可用 /database/schema 代替)
```

---

## 三、部署前端 (Vercel)

### 准备:仓库根的 `vercel.json`

仓库根目录已有 [`vercel.json`](../../vercel.json):

```json
{
  "framework": "vite",
  "buildCommand": "pnpm turbo run build --filter=@ai-insight/web",
  "installCommand": "pnpm install",
  "outputDirectory": "apps/web/dist",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    }
  ]
}
```

要点:
- **`outputDirectory: "apps/web/dist"`** — 因为 Root Directory 是 monorepo 根,默认 `./dist` 不存在,必须显式指向 apps/web 子目录。
- **`buildCommand` 用 turbo** — 自动触发 `@workspace/types` 的 `dependsOn: ["^build"]`,保证共享类型先编译。
- **`rewrites`** — `App.tsx` 用 `BrowserRouter`,刷新 `/settings` 必须 fallback 到 `index.html`,否则 404。
- **`headers`** — Vite 产物文件名带 hash,长期缓存安全。

### Vercel 部署步骤

1. https://vercel.com → **Add New Project** → 选 GitHub 仓库。
2. **Root Directory** 留空(就是 monorepo 根,Vercel 会读取 `vercel.json`)。
3. **Framework Preset** 自动识别为 Vite。
4. **Environment Variables** 添加:

   | 变量 | Value | Environment |
   |------|-------|-------------|
   | `VITE_API_BASE_URL` | `https://<backend-domain>`(Railway 域名) | Production, Preview 都设 |

5. **Deploy** → 等待构建 → 得到 `https://ai-insight-platform-<hash>.vercel.app`。
6. 首次访问 `/settings`,填入 OpenAI 或 Anthropic API Key:
   - Provider: `openai` 或 `anthropic`
   - API Key: 你的 key
   - Model: `gpt-4o-mini` / `claude-sonnet-4-6`
   - 点击保存,看到 Toast "保存成功"
7. 回主页发条消息测试,例如:"上个月各类别销售额":
   - DevTools Network 看到 `/chat/stream` 返回 `text/event-stream`
   - 消息按 `text` → `tool_call`(query_sales)→ `tool_result`(SQL+数据)→ `tool_call`(gen_chart)→ ... 流式推送
   - 图表卡片渲染 ECharts
   - 出现商业洞察(InsightAgent)

---

## 四、回环 CORS

Vercel 域名拿到后:

1. 回到 **Railway → Variables**,修改:
   ```
   FRONTEND_ORIGIN=https://ai-insight-platform-<hash>.vercel.app
   ```
   (注意 https + 无尾斜杠)
2. Railway 自动重新部署后端。
3. 验证:浏览器 DevTools → Console 应**无** `blocked by CORS policy` 错误。

---

## 五、验证清单

部署完成后逐项打勾:

- [ ] **数据库**:`SELECT count(*) FROM "Customer";` 返回 > 0
- [ ] **后端**:`curl <backend>/database/schema` 返回表名 JSON 数组
- [ ] **前端首页**:打开 Vercel URL,看到 Gemini 风格欢迎页 + 推荐问题 chips
- [ ] **路由**:刷新 `/settings` 页面不 404(SPA rewrite 生效)
- [ ] **LLM 配置**:`/settings` 填入 Key 并保存,看到成功 Toast
- [ ] **对话流**:发任意业务问题,DevTools Network 看到 `/chat/stream` 是 `text/event-stream`,事件按 `text` / `tool_call` / `tool_result` 顺序到达
- [ ] **图表**:返回结果包含 ECharts 卡片,数据正确渲染
- [ ] **多轮对话**:刷新页面 → 左侧栏出现历史 session → 点击能加载历史消息
- [ ] **CORS**:DevTools Console 无 CORS 报错
- [ ] **HTTPS**:前后端都强制 https,无 mixed content 警告

---

## 六、可选打磨

### 自定义域名

- Vercel: Project → **Settings** → **Domains** → 添加 `yourdomain.com`,按提示配 DNS。
- Railway: Service → **Settings** → **Domains** → 添加 `api.yourdomain.com`。
- 把 `VITE_API_BASE_URL` 改成新域名,重新部署。

### Preview 环境隔离

Vercel 每个 PR 自动有 preview 域名。如需独立后端:

1. 在 Railway 给该分支起一个 **新 Service**(同一个 repo,选不同 branch)。
2. 给它单独的 Neon 数据库(Neon 支持 branch DB)。
3. Vercel Project → Settings → Git → 配置 Preview 环境的 `VITE_API_BASE_URL` 指向该 Railway 服务。

### 监控 & 日志

- **Railway**: Service → **Logs** 实时跟踪 stdout,出问题时直接看。
- **Vercel**: Project → **Logs** 跟踪构建 + runtime + edge 日志。
- **Neon**: Dashboard → **Monitoring** 看 query 慢查询、连接数。

### LLM 密钥冷启动兜底

如果担心 Railway 重启后 DB 为空导致 LLM 调用静默失败,可以在 Start Command 前加 seed:

```bash
# Railway Variables → Start Command 覆盖
PGPASSWORD=$DB_PASSWORD psql -h $DATABASE_HOST -U $DB_USER -d $DB_NAME \
  -c "INSERT INTO \"LLMConfig\" (id, \"apiKey\", model, temperature) VALUES ('openai','sk-xxx','gpt-4o-mini',0) ON CONFLICT (id) DO NOTHING;" \
  && node dist/main.js
```

---

## 七、已知边界

| 边界 | 影响 | 缓解 |
|------|------|------|
| **Neon 免费层 5 分钟无连接休眠** | 首次连接 ~1s 冷启动 | Neon Pro / 在 NestJS 加 warmup cron |
| **Railway 免费 $5/月、500 小时** | 演示足够,长期运行不够 | Railway Hobby $5/月 |
| **Vercel Hobby 100 GB 带宽/月** | 演示足够 | 监控用量,超了升 Pro |
| **Prisma seed 跑一次后,重启会 DROP+重建表** | Railway 重启会丢业务数据! | 必须 `SEED_ON_BOOT=false`(已配置) |

> ⚠️ **重要**: Railway 后端的 `SEED_ON_BOOT` 必须设为 `false`。entrypoint 每次启动会执行 `DROP TABLE ... schema.sql`,会清掉 Neon 上的所有数据。Seed 只在初始化时跑一次。

---

## 八、附录:env 变量全集

### Vercel (前端)

| 变量 | 必填 | 说明 |
|------|------|------|
| `VITE_API_BASE_URL` | ✅ | 后端公网域名,如 `https://xxx.up.railway.app` |

### Railway (后端)

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | ✅ | Neon 完整连接串 |
| `DATABASE_HOST` | ✅ | Neon host(无端口) |
| `DB_USER` | ✅ | Neon 用户名 |
| `DB_PASSWORD` | ✅ | Neon 密码 |
| `DB_NAME` | ✅ | Neon 数据库名 |
| `PORT` | ✅ | `3000` |
| `NODE_ENV` | ✅ | `production` |
| `SEED_ON_BOOT` | ✅ | `false`(生产必须 false,避免重启清表) |
| `FRONTEND_ORIGIN` | ✅ | Vercel 域名,逗号分隔多域名 |

> LLM API Key 不通过 env 注入,通过前端 `/settings` 运行时配置,存入 `LLMConfig` 表。