-- Sprint 5.5: 删除遗留 Superstore 业务表
-- 主数据库只存平台元数据。业务数据全部通过外部 DataSource 接入。

DROP TABLE IF EXISTS "SalesOrderItem" CASCADE;
DROP TABLE IF EXISTS "SalesOrder" CASCADE;
DROP TABLE IF EXISTS "Product" CASCADE;
DROP TABLE IF EXISTS "Customer" CASCADE;
