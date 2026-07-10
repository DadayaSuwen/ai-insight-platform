/**
 * [Sprint 5.5] 种子脚本已精简
 *
 * 历史:本脚本负责从 superstore_sales.csv 导入 9994 行业务数据到
 * Customer/Product/SalesOrder/SalesOrderItem 四张表。
 *
 * Sprint 5.5 删除了这四张业务表。Superstore 演示数据已导出为
 * prisma/data/superstore_sales.csv,可通过 CSV 上传功能作为
 * DuckDB 数据源接入。
 *
 * 如需恢复 Superstore 演示环境:
 *   1. Settings → 数据源 → 上传 CSV → 选择 superstore_sales.csv
 *   2. 或在外部 PG 中建表后通过"数据库连接"接入
 */
async function main() {
  console.log("✅ Seed: 无需导入业务数据 (Sprint 5.5 已删除 Superstore 表)");
}

main()
  .catch((e) => {
    console.error("Seed 失败:", e);
    process.exit(1);
  })
  .finally(async () => {
    // PrismaClient 不再需要导入业务数据
  });
