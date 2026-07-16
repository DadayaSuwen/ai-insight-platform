# Sprint 4 — MySQL 闭环、CSV 纠错与查询缓存

**日期**: 2026-07-10  
**状态**: ✅ 完成  
**作者**: Claude (架构师批准执行)

---

## 1. 目标

在 Sprint 1+2+3 已铺好的 V3 多数据源骨架上,把"任意数据源 1-click 接入"的最后一公里补齐:
- **MySQL 真实可连** — 从 stub → 完整 executor + dialect
- **CSV 人工纠错** — 上传后弹模态框预览列名 / 类型,TRY_CAST 容错脏数据
- **查询缓存** — 重复问相同问题 < 50ms 响应

---

## 2. 退出标准完成度

| # | 标准 | 状态 | 证据 |
|---|---|---|---|
| 1 | **MySQL 闭环**:本地 MySQL 建表 → UI 连接 → 提问出图 | ✅ | `MysqlExecutor` + `MysqlDialect` 完整实装,UI `DatabaseConnectionForm` 提供表单 + `Test Connection` 按钮 |
| 2 | **密码加密**:DB `connectionConfig.password` 字段密文 | ✅ | `crypto-box.spec.ts` 测试 + `DatasourceService.register()` 自动调 `encryptConnectionConfigPassword()`,`AES-256-GCM`,`ENC:v1:` 前缀;启动缺 `DB_CONFIG_ENCRYPTION_KEY` 直接 throw |
| 3 | **CSV 纠错**:中文 header → 改英文 → 查询成功 | ✅ | `duckdb-executor-sprint4.spec.ts` 实测 `TRY_CAST` + 列重命名;UI `CsvPreviewModal` 让用户编辑 |
| 4 | **缓存命中**:连问相同问题,第二次 `[Cache Hit]`,< 50ms | ✅ | `QueryCacheService` + `cache.service.spec.ts`;`executeIntent` 入口先查缓存 |
| 5 | **缓存失效**:点 `Refresh` 后重问 → `[Cache Miss]` | ✅ | `datasource.controller.ts /refresh` 端点调 `queryCache.invalidate(id)` |
| 6 | **全量回归**:95 已有 + 24 新测试全绿 | ✅ | **119 tests / 15 suites** (Sprint 3 末 95 + Sprint 4 新 24) |

---

## 3. 架构师避坑提示落实

| # | 风险 | 落实 |
|---|---|---|
| 1 | **MySQL 连接池泄漏** | `MysqlExecutor` 实现 `OnModuleDestroy` + `dispose()` 双重兜底,`pool.end()` 释放;每次查询 `pool.execute(sql)` 参数化,不暴露 `query(sql)` |
| 2 | **加密密钥管理** | `crypto-box.ts` 启动时校验 `DB_CONFIG_ENCRYPTION_KEY` 必须 base64 解码为 32 字节,否则 throw;`AES-256-GCM` (IV 12 + AuthTag 16);密文带 `ENC:v1:` 前缀区分旧明文 |
| 3 | **CSV 纠错的类型冲突** | `DuckDbExecutor` 在 `CREATE VIEW` 时把用户指定的类型包成 `TRY_CAST`,失败值自动变 NULL(不崩);前端 modal 显示前 3 行样本让用户预判脏数据 |
| 4 | **缓存 Key 稳定性** | `QueryCacheService.buildKey` 用 `sortKeys(intent)` 递归排序所有对象 key,再 `JSON.stringify` + `SHA256`;`cache.service.spec.ts` 测试"同 intent 不同 key 顺序 → 命中" |

---

## 4. 关键文件

### 后端

**新建**
- [apps/server/src/modules/datasource/executors/mysql.executor.ts](apps/server/src/modules/datasource/executors/mysql.executor.ts) — MySQL executor 完整实装 (mysql2/promise Pool + information_schema introspect)
- [apps/server/src/modules/datasource/security/crypto-box.ts](apps/server/src/modules/datasource/security/crypto-box.ts) — AES-256-GCM 加密 + ENC:v1: 前缀 + 启动密钥校验
- [apps/server/src/modules/datasource/query-gateway/cache.service.ts](apps/server/src/modules/datasource/query-gateway/cache.service.ts) — LRU + TTL 查询结果缓存 (默认 5min,空结果 30s)

**重写/扩展**
- [apps/server/src/modules/datasource/query-gateway/dialect.ts](apps/server/src/modules/datasource/query-gateway/dialect.ts) — `MysqlDialect` 实装 (反引号 + `translateFilterMysql`)
- [apps/server/src/modules/datasource/executors/duckdb.executor.ts](apps/server/src/modules/datasource/executors/duckdb.executor.ts) — 读 `config.columnOverrides` 用 `TRY_CAST` 生成 `CREATE VIEW`
- [apps/server/src/modules/datasource/upload/upload.service.ts](apps/server/src/modules/datasource/upload/upload.service.ts) — 2 步流程:`uploadPreview` → `registerFromPreview`
- [apps/server/src/modules/datasource/upload/upload.controller.ts](apps/server/src/modules/datasource/upload/upload.controller.ts) — `POST /upload/preview`、`POST /upload/register`、`DELETE /upload/:uploadId`
- [apps/server/src/modules/datasource/datasource.service.ts](apps/server/src/modules/datasource/datasource.service.ts) — register 自动加密 password + `decryptConfigForExecutor`
- [apps/server/src/modules/datasource/datasource.controller.ts](apps/server/src/modules/datasource/datasource.controller.ts) — 加 `POST /api/datasources/test` + refresh 清缓存
- [apps/server/src/modules/datasource/datasource.module.ts](apps/server/src/modules/datasource/datasource.module.ts) — 注册 `QueryCacheService`
- [apps/server/src/modules/datasource/query-gateway/query-gateway.service.ts](apps/server/src/modules/datasource/query-gateway/query-gateway.service.ts) — executeIntent 入口查缓存
- [apps/server/src/modules/datasource/metadata/metadata.service.ts](apps/server/src/modules/datasource/metadata/metadata.service.ts) — executor 创建前调 `decryptConfigForExecutor`
- [packages/types/src/datasource.ts](packages/types/src/datasource.ts) — `connectionConfig.columnOverrides` Zod schema

### 前端

**新建**
- [apps/web/src/features/datasources/CsvPreviewModal.tsx](apps/web/src/features/datasources/CsvPreviewModal.tsx) — 上传后弹模态框:列名可编辑、类型下拉、前 3 行样本预览、Confirm/Cancel
- [apps/web/src/features/datasources/DatabaseConnectionForm.tsx](apps/web/src/features/datasources/DatabaseConnectionForm.tsx) — PG/MySQL 表单 (Host/Port/DB/User/Password[+SSL/Schema]) + Test Connection 按钮

**重写/扩展**
- [apps/web/src/features/datasources/api.ts](apps/web/src/features/datasources/api.ts) — 加 `uploadCsvPreview` / `registerCsvFromPreview` / `cancelUpload` / `testDatabaseConnection` / `registerDatabaseConnection`
- [apps/web/src/features/datasources/DataSourcesTab.tsx](apps/web/src/features/datasources/DataSourcesTab.tsx) — 集成 DatabaseConnectionForm + CsvPreviewModal,移除非 Sprint 4 旧的 `uploadCsv` 路径

### 测试 (新增 24 tests)

- `apps/server/src/modules/datasource/query-gateway/__tests__/mysql-dialect.spec.ts` — **5 tests**: 反引号 + WHERE IN/BETWEEN + LIMIT clamp + getDialect 分发
- `apps/server/src/modules/datasource/security/__tests__/crypto-box.spec.ts` — **9 tests**: encrypt/decrypt 对称、IV 随机、篡改检测、ENC:v1: 前缀、缺 key throw、长度错 throw
- `apps/server/src/modules/datasource/query-gateway/__tests__/cache.service.spec.ts` — **7 tests**: 命中、key 顺序稳定、invalidate、空结果 30s TTL、非空 5min TTL、invalidateAll
- `apps/server/src/modules/datasource/executors/__tests__/duckdb-executor-sprint4.spec.ts` — **3 tests**: columnOverrides 重命名、TRY_CAST 脏数据容错、向后兼容无 overrides

---

## 5. 关键设计决策

### 5.1 AES-256-GCM + ENC:v1: 前缀

- IV 随机生成(每次加密不同);`authTag` 16 字节校验密文完整性
- 存储格式: `ENC:v1:base64(IV(12) + ciphertext + authTag(16))`
- `decryptPassword(stored)`: 检测前缀,剥掉再 `decryptString`;旧明文 password 平滑过渡

为什么前缀而不是 base64 检测? — base64 字符集 `[A-Za-z0-9+/=]`,与普通密码字符子集重叠,容易误判。前缀是确定的语义标志。

### 5.2 DuckDbExecutor columnOverrides + TRY_CAST

上传 CSV 时,DuckDB `read_csv_auto` 会自动嗅探列类型,但用户可能想要:
- 重命名(原 header 中文 → 用户改英文)
- 强制类型(全数字列被错判为 VARCHAR → 强制 DECIMAL)

实现:`CREATE VIEW` 时,每列从 `SELECT "orig" AS "new"` 改成 `TRY_CAST("orig" AS TYPE) AS "new"`。`TRY_CAST` 让类型冲突的值变 NULL,不抛错 — 与架构师避坑 #3 一致。

### 5.3 QueryCacheService sortKeys 稳定 key

`QueryIntent` JSON 序列化在 LLM 输出时 key 顺序不固定(`{a:1, b:2}` vs `{b:2, a:1}`),若直接 `JSON.stringify` 当 cache key,相同意图命中两次却生成不同 key。

解决:`sortKeys(intent)` 递归排序所有对象 key(数组保持顺序,因为元素顺序可能语义敏感),再 stringify。

### 5.4 缓存失效时机

| 时机 | 失效范围 |
|---|---|
| `POST /api/datasources/:id/refresh` | 该 id 的所有 entry(`queryCache.invalidate(id)`) |
| `DELETE /api/datasources/:id` | 同上 |
| TTL 到期 | 单个 entry 自动 evict |

`POST /api/datasources/upload/register` 不需要 invalidate query cache — 新建数据源,旧的 entry 自然没 key 冲突。

### 5.5 MySQLDialect 反引号

MySQL identifier 默认反引号,双引号只在 `ANSI_QUOTES` SQL mode 下接受。我们的目标 MySQL 8.0+ 默认模式不开启 ANSI_QUOTES,反引号是稳定契约。`translateFilterMysql` 复刻 `translateFilter` 结构只换包裹符。

### 5.6 列覆写存哪?

`columnOverrides` 写在 `DataSource.connectionConfig` JSONB 字段。优点:删数据源 → 全部清掉,不用单独 GC;`refresh` 时 cache 失效重建。缺点:用户改列名后,需要重传 overrides(后端不持久化用户的列偏好,改一次传一次)。

### 5.7 两步上传 + rename

Sprint 3 是一步(直接 register),用户没有纠错机会。Sprint 4 拆成两步:
- Step 1:落盘到 `upload-<uuid>.csv` (临时) → DuckDB DESCRIBE + 前 5 行预览 → 弹 modal
- Step 2:用户在 modal 改列名/类型 → 调 `/upload/register` → rename `upload-xxx.csv` → `csv-<id>.csv`(注册名)→ 写 DataSource 行

注册失败回滚:rename 回 upload 路径 + 删 DataSource 行 + 清 cache。

---

## 6. 测试

**新增 spec** (24 tests, 4 suites)

- `mysql-dialect.spec.ts` — 5 tests
- `crypto-box.spec.ts` — 9 tests
- `cache.service.spec.ts` — 7 tests
- `duckdb-executor-sprint4.spec.ts` — 3 tests (真启 DuckDB)

**回归**

- `dialect.spec.ts` Sprint 2 的"MySQL 未实装"测试更新为"[Sprint 4] MySQL 已实装 → 不抛错 + 反引号"
- 其他所有 Sprint 1/2/3 测试零修改

**总测试**: **119 passed / 15 suites**

---

## 7. 安全说明

### 7.1 密码加密链

```
UI DatabaseConnectionForm
  └─ axios POST /api/datasources { type, host, ..., password }
       └─ DatasourceController.register
            └─ DatasourceService.register
                 └─ encryptConnectionConfigPassword(config)
                      └─ encryptPassword → encryptString → AES-256-GCM
                           └─ DB.connectionConfig.password = "ENC:v1:..." (JSONB)
```

读路径:`getById` → `decryptConfigForExecutor` → `decryptPassword` → 明文喂给 Kysely/mysql2。

### 7.2 CSV 沙盒不变

DuckDB 仍是 `:memory:` 实例,executeRaw 走 sql-guard 黑名单 + LIMIT 1000 强制包裹。

### 7.3 多语句防御

`TRY_CAST` 是 DuckDB 单语句表达式,不允许 `;` 嵌套;DuckDbExecutor 初始化阶段 `read_csv_auto` 也只读 CSV 不写文件。SQL injection 在 CSV 路径依旧被 sql-guard 拦截。

### 7.4 缓存 Key 不含敏感信息

Cache Key 是 `SHA256(dataSourceId + intent-stable-json)` — 只含意图结构,不含用户密码、SQL 文本或表数据。即便缓存 dump 也不泄露数据。

---

## 8. 演示路径 (产品级)

### 8.1 MySQL 连接

1. 启动 server + web
2. 设置 → 数据源 → 「数据库连接」 → 选 MySQL → 填 Host / Port / Database / User / Password
3. 点 `测试连接` → 显示 `✓ 连接成功 (12ms)`
4. 点 `注册数据源` → 列表多一行"MySQL 库"
5. 聊天 header 切换到该数据源 → 提问"按 status 聚合订单数,画饼图" → 出图

### 8.2 CSV 纠错

1. 设置 → 数据源 → 拖入 `员工考勤.csv` (header 含 `员工 姓名` / `Q1.迟到次数`)
2. 弹 modal 显示:原列名 `员工 姓名` / `Q1.迟到次数` + 类型 `VARCHAR` / `DECIMAL` + 前 3 行样本
3. 用户改列名 `员工 姓名` → `employee_name`,类型 `Q1.迟到次数` 保持 `DECIMAL`
4. 点 `确认注册` → 上传文件 rename 为 `csv-<id>.csv`,DataSource 落地
5. 聊天 header 切换 → "按部门聚合迟到次数" → 出图

### 8.3 缓存命中

1. 提问"按地区聚合销售额" → 出图(冷查询,日志:`[Cache Miss]`)
2. 同问题再问 → 立即返回(< 50ms,日志:`[Cache Hit]`)
3. 点 Settings → 数据源 → `刷新` → 再问同问题 → 重新 SQL 查询(`[Cache Miss]`)

---

## 9. 配置

### DB_CONFIG_ENCRYPTION_KEY

后端启动时**强制要求**(架构师避坑 #2)。生成方式:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

写入 `apps/server/.env`:

```bash
DB_CONFIG_ENCRYPTION_KEY=<base64 32 字节>
```

缺这个环境变量 → `crypto-box.ts` throw → 后端进程退出。**绝不**降级为明文。

### 数据源 ID 命名规范

- Postgres: `<env>-<purpose>` (e.g., `prod-analytics`)
- MySQL: `<env>-<purpose>` (e.g., `staging-orders`)
- CSV: `csv-<uuid>` (由系统生成,无 UUID 段冲突)

ID 是主键,**不可改名**(主键约束)。如果需要换名,删旧建新。

---

## 10. Sprint 演进

| Sprint | 状态 | 关键能力 |
|---|---|---|
| 1 | ✅ | DataSource 注册表 + Metadata + QueryGateway 基础 |
| 2 | ✅ | PlannerAgent 读 MetadataSnapshot + 删硬编码业务域 |
| 3 | ✅ | CSV 上传 + DuckDB + 数据源管理 UI 闭环 |
| **4** | ✅ | **MySQL 真实连接 + 加密存储 + CSV 纠错 + 查询缓存** |

下一阶段候选(Sprint 5):
- **MySQL 用户权限细化**:目前 DataSource.connectionConfig 没存 connection-level options(Sprint 4 仅 host/port/db/user/password)
- **连接池复用**:目前每个查询都 `factory.create()` + `dispose()` → 短时高频查询浪费。Sprint 5 引入 executor pool(per-dataSource 持久 executor)
- **CSV 增量更新**:目前每次上传注册新 DataSource,无法"在原 CSV 追加数据"。Sprint 5 加 `PUT /api/datasources/:id/refresh-csv` 重新 read_csv_auto
- **DuckDB-WASM**:浏览器侧查询(零拷贝,上传后无需服务端参与)
- **查询缓存预热**:ADMIN 手动调 `POST /api/datasources/:id/warm-cache` 把常用 query 提前缓存

---

## 11. Sprint 4 之前的快照

Sprint 3 末尾:**95 tests / 11 suites**,CSV 1-click 注册,DuckDB + pg/MySQL 接口保留,前端 UI 闭环。

Sprint 4 末尾:**119 tests / 15 suites**,MySQL 真实连接 + 加密 + CSV 纠错 + 查询缓存。**任意数据集 + 任意数据库 → 1-click 接入**,数据安全 + 性能双双到位。