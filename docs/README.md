# 项目文档

## 目录结构

```
docs/
├── architecture/    # 架构设计文档
├── api/            # API 接口文档
├── guides/         # 开发指南
├── development/    # 开发过程文档
└── archived/       # 过时文档（仅供参考）
```

## 核心文档

| 文档 | 描述 |
|------|------|
| `../../CLAUDE.md` | 项目快速入门、技术栈、启动命令 |

## 架构文档

| 文档 | 描述 |
|------|------|
| `architecture/SYSTEM.md` | **Planner + Function Calling** 架构设计、ReAct 循环、工具定义 |

## API 文档

| 文档 | 描述 |
|------|------|
| `api/API.md` | API 接口文档（**新增** `/chat/sessions` CRUD、SSE `sessionId` 参数） |
| `api/CONTRACTS.md` | 数据契约定义（Zod schemas） |

## 开发指南

| 文档 | 描述 |
|------|------|
| `guides/SETUP.md` | 开发环境设置、快速启动 |
| `guides/DEBUG.md` | 调试指南、常见问题解决 |
| `guides/CONFIG.md` | TypeScript 配置说明 |
| `guides/DOCKER.md` | Docker 部署指南、架构、故障排查 |

## 开发过程文档

| 文档 | 描述 |
|------|------|
| `development/REFACTOR.md` | 架构重构记录：从 RouterAgent → Planner + Function Calling |
| `development/PHASE_11_DATA_REFACTOR.md` | Phase 11：Kysely / Superstore CSV / Planner & Tools 完善 |
| `development/MULTI_TURN_DIALOGUE.md` | **新增** 多轮次对话 & 聊天 UI 增强（侧栏 / Welcome / Toast / 停止按钮 / 折叠） |
| `development/2026-06-25_LLM_AND_CHAT_PERSISTENCE_FIX.md` | **新增** LLMConfig 持久化 + 多轮上下文 + tool_call_id 修复（Prisma→Kysely 收尾、UUID tool_call id、迁移 SQL） |
| `development/2026-07-10_SPRINT_3_DUCKDB_CSV.md` | **Sprint 3** DuckDB-CSV + 上传 UI + slug 化 + inferSemantics 维度推断 + Docker 卷持久化 |
| `development/2026-07-10_SPRINT_4_MYSQL_CACHE_CSV_FIX.md` | **Sprint 4** MySQL 真实 executor + AES-256-GCM 密码加密 + CSV 列覆写纠错 + QueryGateway LRU/TTL 缓存 |
| `development/2026-07-10_SPRINT_5_MULTI_TENANT_POOL.md` | **Sprint 5** 多租户鉴权 (User/JWT) + DataSource/ChatSession.userId 强隔离 + ExecutorFactory 长连接池复用 + 前端登录/注册/路由守卫 |
| `development/2026-07-11_SPRINT_5_5_CLEANUP.md` | **Sprint 5.5** 清理 Superstore 业务表 + 删除废弃工具(query_sales/dimensions) + 主数据库纯净 |

## 过时文档（仅供参考）

| 文档 | 描述 |
|------|------|
| `archived/SYSTEM.md` | 旧版 RouterAgent 架构（已废弃） |
| `archived/AGENT.md` | 旧版 Agent 链路文档（已废弃） |
| `archived/ISSUES.md` | Phase 3-9 bug 记录（已归档） |

## 快速链接

- **启动项目**：`pnpm dev:all`
- **运行测试**：`pnpm test`
- **数据库**：`pnpm db:up` + `pnpm db:seed`
- **Prisma Studio**：`pnpm db:studio`
- **Docker 部署**：`pnpm docker:up`（详见 `guides/DOCKER.md`）

## 当前架构

本项目采用 **Planner + Function Calling + 元数据驱动的多数据源 V3** 架构：

```
用户输入
    ↓
PlannerAgent.invokeStream(message, history, { dataSourceId })  ← LLM + bindTools([5个工具])
    ↓
MetadataCache.get(dataSourceId)  → 动态生成 schema 注入 system prompt
    ↓
LLM 决定调用工具 → 执行 → 结果回灌 → 再次调用 LLM
    ↓
最终文本流式输出 (SSE text events)
```

**工具**：`query_details` / `gen_chart` / `generate_insight` / `get_table_schema`

**数据源**:
- `postgres` — 外部 PG 数据库
- `mysql` — 外部 MySQL 数据库
- `duckdb-csv` — 用户上传的 CSV,DuckDB 内存引擎查询

> [Sprint 5.5] Superstore 4 张业务表已从主数据库删除。Superstore 演示数据
> 已导出为 CSV,可通过 Settings → 数据源 → 上传 CSV 重新接入。

**前端特性**:

**前端特性**：

- ✅ **多轮对话**：侧栏会话列表 / 新建 / 切换 / 删除 / localStorage 持久化
- ✅ **多轮 tool_calls 历史回放**：修复 6 个后端 Bug（见 `2026-06-25_LLM_AND_CHAT_PERSISTENCE_FIX.md`）后，LLM 可看到前几轮的工具调用
- ✅ **Gemini 风格欢迎页**：新用户首次进入显示大标题 + 副标题 + 推荐问题
- ✅ **Toast 提示**：删除/新建成功失败即时反馈
- ✅ **发送→停止按钮**：流式生成中可点击中止
- ✅ **侧栏折叠**：桌面端可折叠为 56px 图标条
- ✅ **响应式**：移动端用 vaul Drawer，侧栏宽度 280px / 56px / 抽屉三态

详见 [`architecture/SYSTEM.md`](architecture/SYSTEM.md) 和 [`development/MULTI_TURN_DIALOGUE.md`](development/MULTI_TURN_DIALOGUE.md)。