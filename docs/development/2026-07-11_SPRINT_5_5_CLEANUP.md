# Sprint 5.5 — 清理遗留数据库表与废弃代码

**日期**: 2026-07-11 | **状态**: ✅ 完成

## 目标

V3 架构下主数据库只应负责"平台自身的元数据管理"，业务数据应在外部数据源中。将所有 Superstore 硬编码彻底清除。

## 变更清单

### 1. 数据库层

| 操作 | 文件 | 说明 |
|------|------|------|
| 删除 4 模型 | `prisma/schema.prisma` | 移除 Customer / Product / SalesOrder / SalesOrderItem |
| 新迁移 | `prisma/migrations/20260711000000_drop_legacy_superstore_tables/` | DROP TABLE IF EXISTS ... CASCADE |
| 简化 seed | `prisma/seed.ts` | 空 stub，不再导入 CSV 业务数据 |

### 2. 后端工具

| 操作 | 文件 | 说明 |
|------|------|------|
| 删除 | `tools/query-sales.tool.ts` | 已被 query_details 完全覆盖 |
| 删除 | `tools/dimensions.ts` | 硬编码 Superstore SQL builder (DIMENSION_BUILDERS/applyFilters/METRIC_SELECTORS) |
| 新建 | `tools/metric-labels.ts` | 从 dimensions.ts 提取通用 MetricKey + METRIC_LABELS |
| 修改 | `tools/index.ts` | 移除 createQuerySalesTool / QuerySalesCompatArgsSchema 导出 |
| 修改 | `tools/schemas.ts` | 删除 QuerySalesCompatArgsSchema + 弃用 alias |
| 修改 | `tools/tool-result.context.ts` | query_sales → query_details |
| 修改 | `tools/generate-insight.tool.ts` | 更新工具描述 |
| 修改 | `tools/chart.helper.ts` | import 从 dimensions → metric-labels |
| 修改 | `agents/chart.agent.ts` | 同上 |

### 3. PlannerAgent

| 操作 | 说明 |
|------|------|
| 移除 createQuerySalesTool | buildTools() 从 5 工具减为 4 工具 |
| 更新 toolNames | 移除 "query_sales" |
| 更新 system prompt | 示例用通用表名(orders)替代 SalesOrderItem |
| 默认 dataSourceId | "superstore-demo" → "" (不再硬编码兜底) |

### 4. Kysely 类型

| 操作 | 说明 |
|------|------|
| 删除接口 | CustomerTable / ProductTable / SalesOrderTable / SalesOrderItemTable |
| 更新 Database | 移除 4 表引用，仅保留元数据表 |

### 5. Datasource 模块

| 操作 | 文件 | 说明 |
|------|------|------|
| 删除 | `datasource.seed.ts` | 不再自动注册 superstore-demo |
| 修改 | `datasource.module.ts` | 移除 DatasourceSeed provider |
| 修改 | `chat-session.service.ts` | resolveDataSourceId() 空兜底 → "" |

### 6. 前端

| 操作 | 文件 | 说明 |
|------|------|------|
| 移除默认值 | `store/persistence.ts` | loadSelectedDataSourceId 不再兜底 superstore-demo |
| 移除特殊渲染 | `MessageBubble.tsx` | 删除 query_sales 专用表格分支 |
| 通用化 | `DataSourcePicker.tsx` | 不再硬编码 superstore-demo fallback |

### 7. 测试 (17 suites / 130 tests)

| 文件 | 修改 |
|------|------|
| `sql-guard.spec.ts` | Customer → users |
| `dialect.spec.ts` | SalesOrderItem → order_items |
| `intent-validator.spec.ts` | SalesOrderItem → order_items, superstore → testSnap |
| `metadata.service.spec.ts` | 同上 + 移除 "superstore 实际场景" 描述 |
| `token-budget.spec.ts` | Customer → customers, SalesOrder → orders |
| `planner.agent.spec.ts` | SalesOrderItem → order_items, superstore-demo → test-ds |
| `datasource.service.spec.ts` | 移除 DatasourceSeed 引用 |

## 退出标准验证

1. ✅ `schema.prisma` 只含 User / DataSource / DataSourceSnapshot / ChatSession / ChatMessage / LLMConfig
2. ✅ 全局搜索 `SalesOrder` / `query_sales` — 仅在注释/文档中作为历史说明
3. ✅ `npx tsc --noEmit` 干净通过
4. ✅ `pnpm test` 17 套件 130 测试全绿
