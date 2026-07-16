# Docker 生产环境一键部署

## 前置条件

- Docker Engine 24+，Docker Compose v2+
- Linux/macOS 或支持 Docker Desktop 的 Windows 主机
- 至少 2 CPU、4 GB 内存和 20 GB 可用磁盘
- 已配置域名时，建议在 Docker web 容器前使用 HTTPS 反向代理

## 首次部署

```sh
cp .env.production.example .env
# 编辑 .env：必须替换 POSTGRES_PASSWORD、JWT_SECRET、DB_CONFIG_ENCRYPTION_KEY，
# 并同步 DATABASE_URL 与 DB_PASSWORD。

openssl rand -base64 32 # JWT_SECRET 可用
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" # 加密密钥可用

pnpm docker:prod:up
```

`docker:prod:up` 会校验 Compose 配置、构建镜像、启动 PostgreSQL/server/web，并等待健康检查通过。首次启动时仅当 `INIT_SEED=true` 才执行默认 seed；生产建议保持 `INIT_SEED=false`，然后通过登录/管理界面创建账号。

生产入口默认是 `http://localhost:8080`（可通过 `WEB_PORT` 修改）。PostgreSQL 和 NestJS server 不暴露宿主机端口，只在 Compose 内部网络通信。

## 日常操作

```sh
pnpm docker:prod:verify  # 健康检查和静态页面 smoke test
pnpm docker:prod:logs    # 查看日志
pnpm docker:prod:down    # 停止服务但保留数据库卷
pnpm docker:prod:backup  # 生成 backups/ai-insight-*.dump.gz
```

升级时重新执行 `pnpm docker:prod:up` 即可。脚本不会删除 `postgres_data`，禁止在生产环境使用 `docker compose down -v` 或 `pnpm docker:reset`。

## 数据安全

服务端入口脚本只在检测到平台表不存在时应用 `apps/server/prisma/schema.sql`。后续重启会跳过初始化，不会执行 DROP TABLE，也不会自动 seed。当前 schema.sql 是一次性初始化脚本；未来结构变化应使用版本化 Prisma migration，并在升级前备份。

备份建议通过 cron 定时执行，例如每天凌晨：

```cron
0 2 * * * cd /opt/ai-insight-platform && pnpm docker:prod:backup >> /var/log/ai-insight-backup.log 2>&1
```

请将 `backups/` 复制到独立存储，并定期验证恢复流程。恢复操作前先停止 server，避免应用在恢复期间继续写入。

## HTTPS 与网络

Docker web 容器只提供 HTTP。生产公网部署应在宿主机使用 Caddy、Traefik 或 Nginx 终结 TLS，再代理到 `${WEB_PORT}:80`。将 `.env` 中的 `FRONTEND_ORIGIN` 设置为实际 HTTPS 来源，避免使用 `*`。

## 故障排查

- `JWT_SECRET` 或 `DB_CONFIG_ENCRYPTION_KEY` 缺失：检查 `.env`，生产 server 会拒绝启动。
- server 一直 unhealthy：执行 `docker compose ... logs server`，确认 PostgreSQL 已 ready，且 `/health` 能访问。
- 首次初始化失败：查看 server 日志中的 psql 错误；修复变量或数据库后重新执行 `pnpm docker:prod:up`，不要删除数据卷。
- SSE 响应不流式：确认前置代理关闭 buffering；仓库 Nginx 已对 `/chat/` 和 `/ai/` 设置 `proxy_buffering off`。
- 页面能打开但 API 失败：确认 `VITE_API_BASE_URL=/`，并检查 web 容器到 server 的 Compose 网络连接。

## 安全清单

- 使用随机且独立的 PostgreSQL 密码、JWT 密钥和 AES 密钥。
- 不提交 `.env`，不把真实密钥写入镜像或仓库。
- 不对公网暴露 PostgreSQL 5432 或 server 3000。
- 使用 HTTPS、限制 `FRONTEND_ORIGIN`、定期备份并测试恢复。
- 生产升级前先执行 `pnpm docker:prod:backup`。
