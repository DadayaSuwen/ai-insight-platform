import type { MetadataSnapshot, TableMetadata } from "@workspace/types";
import { getDialect } from "../dialect";

/**
 * [Sprint 4 / V3] MysqlDialect 单测
 *
 * 验证 Sprint 4 实装的 MySQL 方言:
 *   - 反引号包裹 identifier
 *   - groupBy + SUM 翻译
 *   - WHERE 翻译(=, IN, BETWEEN)
 *   - LIMIT 1000 clamp
 *   - getDialect("mysql") 走 MysqlDialect 实现(不再 throw)
 */
const table: TableMetadata = {
  name: "orders",
  columns: [
    { name: "region", rawType: "varchar", semanticRole: "dimension", cardinality: -1, sampleValues: ["East", "West"], isPrimaryKey: false, isForeignKey: false },
    { name: "amount", rawType: "decimal", semanticRole: "measure", cardinality: -1, sampleValues: [], isPrimaryKey: false, isForeignKey: false },
    { name: "qty", rawType: "int", semanticRole: "measure", cardinality: -1, sampleValues: [], isPrimaryKey: false, isForeignKey: false },
  ],
  fkHints: [],
};
const snap: MetadataSnapshot = {
  dataSourceId: "mysql-test",
  fetchedAt: new Date().toISOString(),
  tables: [table],
  tokenEstimate: 0,
  truncated: false,
};

describe("[Sprint 4 / V3] MysqlDialect 翻译", () => {
  const dialect = getDialect("mysql");

  test("groupBy + SUM 翻译 + 反引号", () => {
    const { sql } = dialect.translate(
      {
        table: "orders",
        groupBy: ["region"],
        metrics: [{ column: "amount", agg: "SUM", alias: "total" }],
        filters: [],
        limit: 100,
      },
      snap,
    );
    expect(sql).toContain("SELECT `region`, SUM(`amount`) AS `total`");
    expect(sql).toContain("FROM `orders`");
    expect(sql).toContain("GROUP BY `region`");
    expect(sql).toContain("ORDER BY `total` DESC");
    expect(sql).toContain("LIMIT 100");
  });

  test("WHERE IN 翻译", () => {
    const { sql } = dialect.translate(
      {
        table: "orders",
        groupBy: [],
        metrics: [{ column: "qty", agg: "COUNT", alias: "cnt" }],
        filters: [
          { column: "region", op: "IN", value: ["East", "West"] },
        ],
        limit: 50,
      },
      snap,
    );
    expect(sql).toContain("WHERE `region` IN ('East', 'West')");
  });

  test("WHERE BETWEEN 翻译", () => {
    const { sql } = dialect.translate(
      {
        table: "orders",
        groupBy: [],
        metrics: [{ column: "qty", agg: "SUM", alias: "total_qty" }],
        filters: [
          { column: "amount", op: "BETWEEN", value: [100, 500] },
        ],
        limit: 50,
      },
      snap,
    );
    expect(sql).toContain("WHERE `amount` BETWEEN 100 AND 500");
  });

  test("LIMIT clamp 到 1000", () => {
    const { sql } = dialect.translate(
      {
        table: "orders",
        groupBy: [],
        metrics: [{ column: "qty", agg: "COUNT", alias: "c" }],
        filters: [],
        limit: 5000,
      },
      snap,
    );
    expect(sql).toContain("LIMIT 1000");
    expect(sql).not.toContain("LIMIT 5000");
  });

  test("getDialect('mysql') 不再 throw(Sprint 4 之前会抛 'Sprint 2')", () => {
    expect(() => getDialect("mysql")).not.toThrow();
    expect(getDialect("mysql").type).toBe("mysql");
  });
});