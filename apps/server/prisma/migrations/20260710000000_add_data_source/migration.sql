-- ============================================================
-- [Sprint 1] Multi-Datasource V3 — DataSource tables
-- ------------------------------------------------------------
-- 新增 DataSource + DataSourceSnapshot 两表,自动 seed superstore-demo
-- 指向现有 Postgres DATABASE_URL(承载 Customer/Product/SalesOrder/SalesOrderItem
-- 4 张业务表,作为第一个 demo 数据源)。
--
-- 回滚: DROP TABLE "DataSourceSnapshot"; DROP TABLE "DataSource";
-- ============================================================

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "connectionConfig" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSourceSnapshot" (
    "id" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tokenEstimate" INTEGER NOT NULL DEFAULT 0,
    "truncated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DataSourceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DataSourceSnapshot_dataSourceId_fetchedAt_idx"
    ON "DataSourceSnapshot"("dataSourceId", "fetchedAt");

-- AddForeignKey
ALTER TABLE "DataSourceSnapshot" ADD CONSTRAINT
    "DataSourceSnapshot_dataSourceId_fkey"
    FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- Seed superstore-demo DataSource
-- ------------------------------------------------------------
-- 从环境变量读出 host/port/database/user/password 与 DATABASE_URL
-- 一致。该行由 OnModuleInit 也可重现生成;此迁移仅作 first-run 兜底,
-- 若已存在 (id 冲突) DO NOTHING。
-- ============================================================

INSERT INTO "DataSource" (
    "id", "name", "description", "type", "connectionConfig",
    "status", "createdAt", "updatedAt"
) VALUES (
    'superstore-demo',
    'Superstore 销售数据 (Demo)',
    '系统自带的演示数据源(Sprint 1)。承载 apps/server/prisma/seed.ts 加载的 9994 行 SalesOrderItem 数据。新增数据源不影响此 demo。',
    'postgres',
    jsonb_build_object(
        'type', 'postgres',
        'host', COALESCE(current_setting('app.superstore_host', true), 'localhost'),
        'port', COALESCE((current_setting('app.superstore_port', true))::int, 5432),
        'database', current_database(),
        'user', COALESCE(current_setting('app.superstore_user', true), current_user),
        'ssl', false,
        'schema', 'public'
    ),
    'active',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) ON CONFLICT ("id") DO NOTHING;
