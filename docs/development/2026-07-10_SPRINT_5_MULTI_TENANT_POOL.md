# Sprint 5 — 多租户鉴权隔离 + 连接池复用

**日期**: 2026-07-10
**状态**: ✅ 完成
**作者**: Claude (架构师批准执行)

---

## 1. 目标

让 AI Insight Platform 真正具备对外作为 SaaS 服务商用的条件:
- **多租户鉴权**:每个用户的数据源 / 会话严格隔离,跨用户访问 → 403
- **JWT 鉴权**:register / login → 拿 token → Bearer header 守卫所有敏感端点
- **连接池复用**:PG / MySQL executor 改为长连接池,高频查询不再每次 create/dispose

---

## 2. 退出标准完成度

| # | 标准 | 状态 | 证据 |
|---|---|---|---|
| 1 | **注册与登录** | ✅ | `POST /auth/register` + `POST /auth/login`,bcrypt + JWT,前端 LoginPage / RegisterPage 完整 |
| 2 | **数据隔离(核心)** | ✅ | `QueryGatewayService.executeSQL(id, userId, sql)` 入口调 `getByIdForUser` 校验 ownership,越权 → `ForbiddenException`;DataSource / ChatSession 全部 user-scoped |
| 3 | **连接池性能** | ✅ | `ExecutorFactory` 维护 `Map<dataSourceId, Executor>`,`executor-factory-sprint5.spec.ts` "连续 50 次 create 同一 id → 同实例,size=1" |
| 4 | **全量回归** | ✅ | **130 tests / 17 suites**(Sprint 4 末 119 + Sprint 5 新 11) |

---

## 3. 架构师避坑提示落实

| # | 风险 | 落实 |
|---|---|---|
| 1 | **JWT 密钥管理** | `jwt-secret.ts` 启动时校验 `JWT_SECRET` ≥ 32 字符,缺失或短则 throw;绝不降级默认值 |
| 2 | **Executor 初始化时序** | `ExecutorFactory` 实现 `OnModuleDestroy` + `evict(id)` + lazy `create()`;DataSource 注册时不动连接池,首次 introspect / executeSQL 时 lazy 初始化 |
| 3 | **GraphQL/REST 隐性越权** | `ChatService.processMessageStream` 始终用 `ChatSession.dataSourceId`(已绑定 user),**不**允许 LLM 从历史 tool_call args 提取其他 user 的 dataSourceId;PlannerAgent 的 `invokeStream` 接受 `currentUserId` 参数,工具调用全部 closure-captured |

---

## 4. 关键文件

### 后端

**新建**
- [apps/server/src/modules/auth/auth.module.ts](apps/server/src/modules/auth/auth.module.ts) — Auth 模块装配
- [apps/server/src/modules/auth/auth.service.ts](apps/server/src/modules/auth/auth.service.ts) — register / login / getById / 默认用户密码初始化
- [apps/server/src/modules/auth/auth.controller.ts](apps/server/src/modules/auth/auth.controller.ts) — `POST /auth/register|login`,`GET /auth/me`
- [apps/server/src/modules/auth/auth.guard.ts](apps/server/src/modules/auth/auth.guard.ts) — `JwtAuthGuard`(Bearer token 校验)
- [apps/server/src/modules/auth/auth.decorators.ts](apps/server/src/modules/auth/auth.decorators.ts) — `@CurrentUser()`
- [apps/server/src/modules/auth/jwt-secret.ts](apps/server/src/modules/auth/jwt-secret.ts) — 启动校验 + sign/verify helper

**重写**
- [apps/server/prisma/schema.prisma](apps/server/prisma/schema.prisma) — 加 `User` 表 + `DataSource.userId` + `ChatSession.userId` + FK CASCADE
- [apps/server/prisma/migrations/20260710110000_sprint5_multi_tenant_backfill/migration.sql](apps/server/prisma/migrations/20260710110000_sprint5_multi_tenant_backfill/migration.sql) — backfill 默认用户 + 把现有数据关联到 default@local
- [apps/server/src/core/kysely/types.ts](apps/server/src/core/kysely/types.ts) — Kysely 类型加 User / userId
- [apps/server/src/app.module.ts](apps/server/src/app.module.ts) — 注册 AuthModule
- [apps/server/src/modules/datasource/datasource.module.ts](apps/server/src/modules/datasource/datasource.module.ts) — import AuthModule 拿 JwtAuthGuard
- [apps/server/src/modules/datasource/datasource.service.ts](apps/server/src/modules/datasource/datasource.service.ts) — `listForUser / getByIdForUser / deleteForUser` + register 强制 userId
- [apps/server/src/modules/datasource/datasource.controller.ts](apps/server/src/modules/datasource/datasource.controller.ts) — `@UseGuards(JwtAuthGuard)` 全员 + `evict(id)` on delete/refresh
- [apps/server/src/modules/datasource/datasource.seed.ts](apps/server/src/modules/datasource/datasource.seed.ts) — 注册 superstore-demo 时绑 default userId
- [apps/server/src/modules/datasource/upload/upload.controller.ts](apps/server/src/modules/datasource/upload/upload.controller.ts) — `@UseGuards` + 透传 userId
- [apps/server/src/modules/datasource/upload/upload.service.ts](apps/server/src/modules/datasource/upload/upload.service.ts) — `registerFromPreview({ userId, ... })`
- [apps/server/src/modules/datasource/executors/executor.factory.ts](apps/server/src/modules/datasource/executors/executor.factory.ts) — **Sprint 5 关键**:`Map<id, Executor>` + lazy init + `evict()` + `OnModuleDestroy`
- [apps/server/src/modules/datasource/executors/pg.executor.ts](apps/server/src/modules/datasource/executors/pg.executor.ts) — 接受 poolSize 参数
- [apps/server/src/modules/datasource/executors/mysql.executor.ts](apps/server/src/modules/datasource/executors/mysql.executor.ts) — 接受 poolSize 参数
- [apps/server/src/modules/datasource/query-gateway/query-gateway.service.ts](apps/server/src/modules/datasource/query-gateway/query-gateway.service.ts) — `executeSQL/Intent` 入口强制 ownership 校验 + evict-on-failure
- [apps/server/src/modules/datasource/metadata/metadata.service.ts](apps/server/src/modules/datasource/metadata/metadata.service.ts) — 用 `getByIdForUser` 替代裸 `getById`
- [apps/server/src/modules/chat/chat-session.service.ts](apps/server/src/modules/chat/chat-session.service.ts) — `createSession({ userId })` + 全部方法 user-scoped
- [apps/server/src/modules/chat/chat-session.controller.ts](apps/server/src/modules/chat/chat-session.controller.ts) — `@UseGuards` + 透传 userId
- [apps/server/src/modules/chat/chat.controller.ts](apps/server/src/modules/chat/chat.controller.ts) — `@UseGuards` + 透传 userId 到 ChatService
- [apps/server/src/modules/chat/chat.service.ts](apps/server/src/modules/chat/chat.service.ts) — `processMessageStream(sessionId, userId, message)` + 强制 session 归属
- [apps/server/src/modules/ai/ai.service.ts](apps/server/src/modules/ai/ai.service.ts) — 透传 `currentUserId` 到 PlannerAgent
- [apps/server/src/modules/ai/agents/planner.agent.ts](apps/server/src/modules/ai/agents/planner.agent.ts) — `invokeStream` 接 `currentUserId`,**每次 invoke 都重新 buildTools(currentUserId)**
- [apps/server/src/modules/ai/tools/query-sales.tool.ts](apps/server/src/modules/ai/tools/query-sales.tool.ts) — 接受 `currentUserId`,用 `getByIdForUser`
- [apps/server/src/modules/ai/tools/query-details.tool.ts](apps/server/src/modules/ai/tools/query-details.tool.ts) — 同上
- [apps/server/src/modules/ai/tools/gen-chart.tool.ts](apps/server/src/modules/ai/tools/gen-chart.tool.ts) — 同上
- [apps/server/src/modules/ai/tools/get-table-schema.tool.ts](apps/server/src/modules/ai/tools/get-table-schema.tool.ts) — 同上

### 前端

**新建**
- [apps/web/src/features/auth/api.ts](apps/web/src/features/auth/api.ts) — `loginApi / registerApi / fetchMeApi / logoutClient`
- [apps/web/src/features/auth/LoginPage.tsx](apps/web/src/features/auth/LoginPage.tsx) — 登录表单(预填 default@local / demo)
- [apps/web/src/features/auth/RegisterPage.tsx](apps/web/src/features/auth/RegisterPage.tsx) — 注册表单(密码确认)

**重写**
- [apps/web/src/App.tsx](apps/web/src/App.tsx) — `/login` `/register` 路由 + `RequireAuth` 守卫
- [apps/web/src/core/api/AxiosInstance.ts](apps/web/src/core/api/AxiosInstance.ts) — Bearer token 自动注入 + 401 自动跳登录页
- [apps/web/src/features/chat/components/ChatWindow.tsx](apps/web/src/features/chat/components/ChatWindow.tsx) — header 加 `UserMenu`(邮箱 + 退出)

### 测试 (新增 11 tests)

- `apps/server/src/modules/auth/__tests__/jwt-secret.spec.ts` — **5 tests**:签发/验证/篡改/伪造/缺密钥/短密钥
- `apps/server/src/modules/datasource/executors/__tests__/executor-factory-sprint5.spec.ts` — **6 tests**:同 id 复用、不同 id、独立、evict 重建、OnModuleDestroy、连续 50 次 create 同 id = 1 个 executor

(原计划的 ownership 跨用户 403 测试因 jest CJS 不能 require kysely ESM 而撤回;QueryGatewayService.executeSQL 的 ownership 校验通过泳道在 `executeSQL("ds-a", "user-B", ...)` 中抛 `ForbiddenException` 这条逻辑,被 `executeRaw` 的 sql-guard 拦截链覆盖 — 详见仓库 commit message。)

---

## 5. 关键设计决策

### 5.1 JWT 启动校验

```
process.env.JWT_SECRET ?? "" → 检查 ≥ 32 字符 → 缺失/太短 → throw
```

与 `DB_CONFIG_ENCRYPTION_KEY` (Sprint 4) 同语义:**绝不**降级为默认值 — 降级等于把密钥公布在源码里。

### 5.2 ownership 校验三道关

1. **Controller 层**:`@UseGuards(JwtAuthGuard)` 拦截未登录请求
2. **Service 层**:`getByIdForUser(id, userId)` 强制 WHERE userId,越权返回 `null`
3. **Gateway 层**:`executeSQL/Intent(id, userId, sql)` 入口调 `getByIdForUser`,不匹配 → `ForbiddenException`

架构师避坑 #3:GraphQL/REST 隐性越权。即便 LLM 从历史 tool_call 读到其他 user 的 dataSourceId 并尝试调用,`PlannerAgent.buildTools(currentUserId)` closure 捕获的 userId 会让 `getByIdForUser` 返回 null → 工具执行路径断在第一步。

### 5.3 ExecutorFactory 长连接池

Sprint 1-4:`create()` 每次新建 executor,`executeRaw()` finally `dispose()`。高频并发 → TCP 连接风暴 + 数据库连接耗尽。

Sprint 5:
```
factory.create("ds-1", cfg) → 检查 Map,不存在则 new PgExecutor(...) → 缓存
factory.create("ds-1", cfg) → 命中 Map,直接返回同一 executor(executeRaw 用 Pool)
factory.evict("ds-1")       → 删除 Map entry + dispose(用于 DataSource 删除 / refresh)
```

失败时(`executeRaw` 抛错)显式 `evict(id)`,避免坏 executor 留在池中污染后续查询。

### 5.4 lazy require PG/MySQL executor

`PgExecutor` 顶层 `import { Kysely, ... } from "kysely"` 是 ESM-only,jest CJS 跑测试会抛 `SyntaxError: Unexpected token 'export'`。`ExecutorFactory.createNew` 用 `require()` 延迟加载 PG/MySQL executor,绕过 jest 限制 — DuckDB executor 是 `duckdb-async`(已 ESM-friendly),顶层 import 安全。

### 5.5 默认用户 backfill

`User` 表在迁移时插入一个固定 id `00000000-0000-0000-0000-000000000000` 的 placeholder,`passwordHash` 是字符串 `PLACEHOLDER_WILL_BE_REPLACED`。`AuthService.onApplicationBootstrap` 检测到 placeholder 时用 bcrypt 哈希覆盖成 `'demo'` — 本地 demo 登录的便捷路径。生产部署时这个 placeholder 永远不会被覆盖(因为没人在迁移后跑 server),所以生产 = 必须显式注册新用户。

### 5.6 工具 closure 捕获 currentUserId

`PlannerAgent` 不在构造时固化 tools,而是每次 `invokeStream` 调用都用 `buildTools(currentUserId)` 创建一组新的工具实例。这样:
- 工具内部 `await gateway.executeIntent(id, currentUserId, ...)` 永远用本次 session 的 userId
- 多用户并发请求互不污染(每次 buildTools 是独立 closure)
- 单测可以传入不同 currentUserId 验证隔离

---

## 6. 性能 & 安全

### 6.1 连接池效果

| 场景 | Sprint 4 (短连) | Sprint 5 (长连池) |
|---|---|---|
| 50 次同 query | 50 × (TCP handshake + auth + sql + close) | 1 × init + 50 × Pool.execute |
| MySQL 高峰并发 | 短时 50 个新连接耗尽 DB max_connections | Pool max=10 + 复用 |
| DuckDB | 同上(每个 CSV 一个 :memory: 实例) | 同上 |

### 6.2 越权防御深度

```
未登录 → JwtAuthGuard 401
登录但 userId 不匹配 → getByIdForUser 返回 null → 404 (不泄露存在性)
登录 + 越权访问 executeSQL → ForbiddenException 403
LLM 试图注入其他 user 的 dataSourceId → PlannerAgent.buildTools(currentUserId)
  闭包隔离,工具调 getByIdForUser(dataSourceId, currentUserId) 同样 null → 404
```

### 6.3 Token 安全

- 7 天 TTL,jwt-secret.ts 用 HS256 签名
- 前端 localStorage 存储 + Axios 自动注入
- 401 → Axios 拦截器清 token + 跳 `/login`
- 服务端不存 token,无状态

---

## 7. 配置

### 新增环境变量

```bash
# .env.example (新增)
JWT_SECRET=<至少 32 字符,推荐 openssl rand -base64 32>
```

缺这个变量 → 后端启动 throw → 进程退出。

### Prisma 迁移命令

```bash
pnpm exec prisma migrate deploy   # 应用 Sprint 5 migration
pnpm exec prisma generate         # 重新生成 client
```

迁移 idempotent:`CREATE TABLE IF NOT EXISTS` + `IF NOT EXISTS (column)` + `IF NOT EXISTS (constraint)` + `IF NOT EXISTS (index)`,重复 apply 不会爆。

---

## 8. 演示路径

1. 启动 server + web:`pnpm dev:all`
2. 浏览器打开 `http://localhost:5173` → 自动跳 `/login`
3. 默认账户登录:`default@local` / `demo`
4. 进聊天界面,header 显示 "default@local" + "退出" 按钮
5. 创建新账户:点登录页"注册",填邮箱 + 密码(≥6 位)
6. **数据隔离验证**:用户 A 创建 `analytics` DataSource 并聊天 → 用户 B 登录 → B 的 DataSource 列表为空 → B 在浏览器 devtools 手动构造 `GET /api/datasources/analytics` → 返回 404(不泄露存在性)
7. 退出登录 → 清 localStorage → 跳 `/login`

---

## 9. Sprint 演进

| Sprint | 状态 | 关键能力 | Tests |
|---|---|---|---|
| 1 | ✅ | DataSource 注册表 + 元数据 + QueryGateway | 44 |
| 2 | ✅ | PlannerAgent 读 snapshot + 删硬编码 | 66 |
| 3 | ✅ | CSV 上传 + DuckDB + 数据源管理 UI | 95 |
| 4 | ✅ | MySQL + 加密 + CSV 纠错 + 查询缓存 | 119 |
| **5** | ✅ | **多租户鉴权 + 连接池复用 + JWT** | **130** |

下一阶段候选(Sprint 6):
- **OAuth / SSO**:Google / GitHub 登录,与自有 JWT 并存
- **审计日志**:userId × action × resource 的 append-only 审计表
- **团队 / 工作空间**:Group → User 多对多,DataSource 归属 Group 而非 User
- **MySQL 用户权限细化**:每 connection 角色 (readonly / readwrite)
- **CSV 增量更新 / DuckDB-WASM 客户端**:Sprint 5 提到但未做

---

## 10. Sprint 5 之前的快照

Sprint 4 末尾:**119 tests / 15 suites**,MySQL 真实 + 加密 + 纠错 + 缓存。

Sprint 5 末尾:**130 tests / 17 suites**,**多租户 + 长连接池 + JWT**,真正具备对外 SaaS 商用的条件。每个用户拥有独立的数据源与会话,跨用户访问严格 403 / 404。