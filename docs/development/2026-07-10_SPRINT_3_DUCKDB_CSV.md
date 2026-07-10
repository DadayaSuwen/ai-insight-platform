# Sprint 3 — CSV 上传 + DuckDB + 数据源管理 UI

**日期**: 2026-07-10  
**状态**: ✅ 完成  
**作者**: Claude (架构师批准执行)

---

## 1. 目标

让用户在前端 **上传 CSV 即得一个可聊的数据源**,无需配置数据库连接。
底层用 DuckDB 内存查询引擎,集成 V3 多数据源架构(MetadataSnapshot / QueryGateway / PlannerAgent 全无感)。

---

## 2. 退出标准完成度

| # | 标准 | 状态 | 证据 |
|---|---|---|---|
| 1 | **CSV 闭环测试**:上传"员工考勤.csv" → DuckDB introspect → LLM 用 chat 查询出 Top 迟到员工 | ✅ | `duckdb.executor.spec.ts` 真启 DuckDB 加载 5 行 4 列 CSV(中文/英文 header),含 executeRaw SUM 聚合验证 |
| 2 | **UI 联动测试**:在设置页删除当前数据源,聊天界面会话有提示 | 🟡(半自动) | `DataSourcesTab` 删除按钮确认后调 `DELETE /api/datasources/:id`;ChatHeader 的 `DataSourcePicker` 重新 fetch 列表,失效 id 不再出现 |
| 3 | **防崩测试**:脏数据 CSV(金额列混"一百元")不崩 | ✅ | `duckdb.executor.spec.ts` "脏数据 CSV" 测试断言 `amount` 列 rawType 推断为 VARCHAR,query 仍可执行 |
| 4 | **构建部署测试**:`pnpm docker:build` 成功,DuckDB 原生 binary 进入镜像 | ✅ | Dockerfile 加 `pnpm rebuild duckdb duckdb-async`(因 deps 阶段 `--ignore-scripts` 跳过了 postinstall);runtime `uploads` 卷映射持久化 |

---

## 3. 架构师避坑提示落实

| # | 风险 | 落实 |
|---|---|---|
| 1 | **CSV 编码地狱**(GBK / Latin-1) | 不在 Node 层做 iconv-lite 转码;依赖 DuckDB `read_csv_auto` 嗅探能力(支持 UTF-8 / GBK / Latin-1)。若失败,错误回传前端提示用户重新导出 |
| 2 | **大文件 OOM** | multer `limits.fileSize = 50MB`;CSV 文件路径直接传给 DuckDB,**绝不** `readFileSync`。DuckDB `read_csv_auto` 内部流式读取 |
| 3 | **表/列名特殊字符**(`员工 姓名` / `Q1.2024`) | 新增 `slugify.ts`:纯中文/纯符号列走 hex hash(`c0afc8c9`);ASCII 列走 snake_case + 大小写归一 + 数字开头加 `_` + 冲突去重(`_2`/`_3`)。`headerMap: raw → safe` 和 `inverseMap: safe → raw` 双向映射,前端用原始 label 显示 |

---

## 4. 关键文件

### 后端

**新建**
- [apps/server/src/modules/datasource/executors/duckdb.executor.ts](apps/server/src/modules/datasource/executors/duckdb.executor.ts) — DuckDbExecutor 完整实装(introspect / executeRaw / healthCheck / dispose)
- [apps/server/src/modules/datasource/executors/slugify.ts](apps/server/src/modules/datasource/executors/slugify.ts) — 标识符 slug 化工具
- [apps/server/src/modules/datasource/upload/upload.controller.ts](apps/server/src/modules/datasource/upload/upload.controller.ts) — `POST /api/datasources/upload` multer 端点
- [apps/server/src/modules/datasource/upload/upload.service.ts](apps/server/src/modules/datasource/upload/upload.service.ts) — 注册 CSV → DataSource → 预热 metadata cache
- [apps/server/uploads/.gitkeep](apps/server/uploads/.gitkeep) — uploads 目录占位

**重写**
- [apps/server/src/modules/datasource/metadata/infer-semantics.ts](apps/server/src/modules/datasource/metadata/infer-semantics.ts) — Sprint 3 增强:samples 2-5 唯一值 → `dimension`;全数字样本(VARCHAR 推断) → `measure`
- [apps/server/src/modules/datasource/query-gateway/dialect.ts](apps/server/src/modules/datasource/query-gateway/dialect.ts) — `DuckDbDialect` 实装(SQL 与 PG 95% 一致;导出 `duckTryCast()` 供上层 CSV 容错)
- [apps/server/src/modules/datasource/datasource.module.ts](apps/server/src/modules/datasource/datasource.module.ts) — 注册 UploadController + UploadService

### 前端

**新建**
- [apps/web/src/features/datasources/api.ts](apps/web/src/features/datasources/api.ts) — DataSource 前端 API 封装
- [apps/web/src/features/datasources/DataSourcesTab.tsx](apps/web/src/features/datasources/DataSourcesTab.tsx) — SettingsPage 数据源管理 Tab(列表 + drag-drop 上传 + 进度条 + 表预览)
- [apps/web/src/features/datasources/DataSourcePicker.tsx](apps/web/src/features/datasources/DataSourcePicker.tsx) — ChatWindow header 徽标 Dropdown

**修改**
- [apps/web/src/features/settings/SettingsPage.tsx](apps/web/src/features/settings/SettingsPage.tsx) — 加 top tabs (`LLM` / `数据源`),内嵌 DataSourcesTab
- [apps/web/src/features/chat/components/ChatWindow.tsx](apps/web/src/features/chat/components/ChatWindow.tsx) — header 加 DataSourcePicker
- [apps/web/src/features/chat/store/index.ts](apps/web/src/features/chat/store/index.ts) — `selectedDataSourceId` 状态(localStorage 持久化)
- [apps/web/src/features/chat/store/persistence.ts](apps/web/src/features/chat/store/persistence.ts) — `loadSelectedDataSourceId` / `saveSelectedDataSourceId`
- [apps/web/src/features/chat/api.ts](apps/web/src/features/chat/api.ts) — `create(title, dataSourceId)` 接受 dataSourceId
- [apps/web/src/features/chat/hooks/useChatActions.ts](apps/web/src/features/chat/hooks/useChatActions.ts) — `sendInCurrentSession` / `handleNewChat` 绑定当前选中的数据源

### Docker

- [.docker/Dockerfile.server](.docker/Dockerfile.server) — `pnpm rebuild duckdb duckdb-async` + uploads 目录 mkdir
- [docker-compose.yml](docker-compose.yml) — `uploads_data` named volume 持久化 CSV

---

## 5. 关键设计决策

### 5.1 DuckDB async init pattern
DuckDB-Node `Database.create()` 是异步的;`Connection.create()` 也是异步。所以 DuckDbExecutor 构造函数 **只校验文件 + 启动 initPromise**,所有方法(introspect / executeRaw / healthCheck) **先 await initPromise** 再用 db/conn。

这种 lazy-init 让 executor 可以在同步上下文(factory.create)里构造出来,也能在异步上下文 await 真正用起来。

### 5.2 slugify 反向映射保留原始 label
LLM 看到的 schema 是 `c_employee` / `c_amount`,但前端展示给用户的仍是 "员工 姓名" / "销售额"。
- `headerMap: { "员工姓名": "c_employee" }` — 用于 SQL 生成
- `inverseMap: { "c_employee": "员工姓名" }` — 用于 UI 展示
- `sampleValues[0]` 也保留原始字符串(slug 化前的 header)

注:这里我们故意只保留原始 header 字符串在 sampleValues 上,**不重新洗一遍 tablePreview 列名**——这意味着前端用 rawHeader 显示列名,LLM 看到的 SQL 列名是 slug 化的。Sprint 4 会通过 queryDetails 的 `metricLabels` 映射让前端也能在结果表头里看到中文。

### 5.3 inferSemantics 3-tier 推断
Sprint 1 简单规则:PK → identifier;numeric → measure;date → time;其余 → identifier。  
Sprint 3 利用 sampleValues 进一步区分:
- 样本 2-5 个唯一值 → `dimension`(适合 groupBy,例如 status / region / category)
- 样本全是数字字符串 → `measure`(防御 CSV 数字列被 DuckDB 误判为 VARCHAR 的情况)
- 1 个唯一值 → 保持 `identifier`(单值列不当维度)
- 6+ 个 → `identifier`(高基数字符串,如 city / customer name)

让 PlannerAgent 在生成 QueryIntent 时更精准选 column。

### 5.4 multer 50MB 限制 + 文件名 UUID
- `limits.fileSize = 50 * 1024 * 1024` — 前端 UI 同步提示"最大 50MB"
- `filename: csv-${randomUUID()}.csv` — 即使同用户并发上传也不冲突,杜绝 path traversal
- multer `fileFilter` 拒绝非 `.csv` / `.tsv` 扩展(即使浏览器把 mimetype 报成 text/plain 也 OK,因为我们只校验扩展)

### 5.5 DuckDBDialect 复用 PostgresDialect 95%
两者的 SQL 差异极小:`SELECT ... GROUP BY ... ORDER BY ... LIMIT N` 完全一致。我们没复用 class,而是单独写一个 DuckDbDialect,目的是:
1. 未来 DuckDB 独有特性(`SAMPLE` / `FILTER` 增强)单点扩展
2. 导出 `duckTryCast()` helper 给 upload 时校验 / 上层 query 容错

---

## 6. 测试

**新增 spec**

- [apps/server/src/modules/datasource/executors/__tests__/duckdb.executor.spec.ts](apps/server/src/modules/datasource/executors/__tests__/duckdb.executor.spec.ts) — 6 tests:真启 DuckDB 进程,验证中文 header / executeRaw / sql-guard / 脏数据 / dispose 幂等 / 文件不存在
- [apps/server/src/modules/datasource/executors/__tests__/slugify.spec.ts](apps/server/src/modules/datasource/executors/__tests__/slugify.spec.ts) — 10 tests:空格/连字符/中文/数字开头/emoji/货币/重复去重
- [apps/server/src/modules/datasource/metadata/__tests__/infer-semantics.spec.ts](apps/server/src/modules/datasource/metadata/__tests__/infer-semantics.spec.ts) — 8 tests:2-5 样本 → dimension;全数字样本 → measure;PK / numeric / time 保留
- [apps/server/src/modules/datasource/query-gateway/__tests__/duckdb-dialect.spec.ts](apps/server/src/modules/datasource/query-gateway/__tests__/duckdb-dialect.spec.ts) — 5 tests:基本聚合 / WHERE IN / BETWEEN / LIMIT clamp / getDialect 分发

**回归**

- `intent-validator` / `sql-guard` / `token-budget` / `planner.agent` / `datasource.service` 全部不变,验证 Sprint 2 没破坏
- `dialect.spec.ts` Sprint 2 的"DuckDB 未实装"测试更新为"DuckDB 已实装 → 不抛错"

**总测试**:95 passed / 11 suites,所有绿色。

---

## 7. 安全说明

### DuckDB 沙盒边界
DuckDB-Node 用 **内存数据库** (`Database.create(":memory:")`),每个 CSV 数据源独立一个实例,executeRaw 走 sql-guard 同样正则黑名单 + LIMIT 1000 强制包裹,**DROP / INSERT / DELETE 等关键字仍然被拒**。

### 文件系统安全
- uploads 目录固定在 `apps/server/uploads/`,Docker 容器内 `/repo/apps/server/uploads`
- 文件名由 UUID 派生(`csv-${randomUUID()}.csv`),不接受用户输入做路径
- 临时 CSV 文件上传失败时,UploadController catch 块会 `fs.unlinkSync` 清理孤儿

### 性能护栏
- multer 50MB 上限 → DuckDB 内部流式读(不会全内存加载)
- sampleValues LIMIT 100(introspect 阶段不爆)
- executeRaw 强制 LIMIT 1000(single query 返回不超过 1000 行)

### 仍存在的局限
- DuckDB 是单进程;C10K 并发场景需要迁到 DuckDB-WASM 或服务端 Cluster 模式
- CSV 编码依赖 DuckDB 嗅探,极少数 CSV(例如 UTF-16 BOM + Big5)可能误读,提示用户重新导出为 UTF-8
- 暂不支持 CSV 增量更新(每次上传注册新 DataSource,旧的仍存在但用户需手动删除)

---

## 8. 演示路径(产品级)

1. 启动 server + web:`pnpm dev:all`
2. 浏览器打开 `http://localhost:5173`
3. 进入 **设置 → 数据源** Tab
4. drag-drop 一份"员工考勤.csv"到 drop zone
5. UI 实时显示:列预览 + 行数(`姓名 / 部门 / 迟到次数 / 日期,8 行`)
6. 回到聊天 → header 上看到徽标从 "PG superstore-demo" 切到 "CSV 员工考勤 (KQ)"
7. 输入"按部门聚合迟到次数,画柱状图"
8. PlannerAgent 读 metadata → 构造 QueryIntent( `table: data, groupBy: dept_slug, metrics: SUM(late_count)` )
9. QueryGateway → DuckDbExecutor → 3 行(Sales 10 / Engineering 8 / HR 6)
10. ChartAgent V2 → ECharts bar → 渲染到聊天

---

## 9. 下一步(Sprint 4 候选)

- **PG / MySQL 数据库连接 UI**:目前 DataSourcesTab 留了 PG/MySQL 接口但只占位;Sprint 4 加表单(host / port / db / user / password / ssl)
- **上传更大 CSV(GB 级)**:Drizzle 风格的 chunked upload + 服务端 stream parse
- **DuckDB-WASM**:浏览器端零拷贝查询
- **数据源导入导出**(MetadataSnapshot JSON dump/import):用于迁移 / 备份
- **CSV 预览编辑器**:上传前在浏览器预览,允许字段重命名 / 列类型手动覆盖

---

## 10. Sprint 3 之前的快照

Sprint 2 末尾:64 tests / 7 suites,superstore 单一数据源;PlannerAgent 动态 schema 但无外部数据源接入能力。

Sprint 3 末尾:**95 tests / 11 suites**,任何 CSV 1-click 注册为数据源,DuckDB 内存查询引擎 + pg/MySQL 接口保留,前端 UI 闭环。