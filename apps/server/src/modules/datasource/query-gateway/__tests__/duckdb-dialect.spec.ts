import type { MetadataSnapshot, TableMetadata } from "@workspace/types";
import { DuckDbDialect, getDialect } from "../dialect";

/**
 * [Sprint 3] DuckDB dialect 单测
 *
 * 验证:
 *   - groupBy + SUM(metrics) 翻译成标准 SQL
 *   - LIMIT 包裹
 *   - 复杂 WHERE(filter)翻译
 *   - getDialect 分发 ('duckdb-csv' → DuckDbDialect)
 */
const table: TableMetadata = {
  name: "data",
  columns: [
    { name: "name", rawType: "VARCHAR", semanticRole: "dimension", cardinality: -1, sampleValues: ["A", "B"], isPrimaryKey: false, isForeignKey: false },
    { name: "amount", rawType: "DOUBLE", semanticRole: "measure", cardinality: -1, sampleValues: [], isPrimaryKey: false, isForeignKey: false },
    { name: "qty", rawType: "INTEGER", semanticRole: "measure", cardinality: -1, sampleValues: [], isPrimaryKey: false, isForeignKey: false },
  ],
  fkHints: [],
};
const snap: MetadataSnapshot = {
  dataSourceId: "csv-test",
  fetchedAt: new Date().toISOString(),
  tables: [table],
  tokenEstimate: 0,
  truncated: false,
};

describe("[Sprint 3 / V3] DuckDbDialect 翻译", () => {
  test("基本 groupBy + SUM 聚合", () => {
    const dialect = new DuckDbDialect();
    const out = dialect.translate(
      {
        table: "data",
        groupBy: ["name"],
        metrics: [{ column: "amount", agg: "SUM", alias: "total" }],
        filters: [],
        limit: 100,
      },
      snap,
    );
    expect(out.sql).toContain('SELECT "name", SUM("amount") AS "total"');
    expect(out.sql).toContain('FROM "data"');
    expect(out.sql).toContain('GROUP BY "name"');
    expect(out.sql).toContain('ORDER BY "total" DESC');
    expect(out.sql).toMatch(/LIMIT 100/);
  });

  test("WHERE IN / BETWEEN 翻译", () => {
    const dialect = new DuckDbDialect();
    const out = dialect.translate(
      {
        table: "data",
        groupBy: ["name"],
        metrics: [{ column: "qty", agg: "COUNT", alias: "cnt" }],
        filters: [
          { column: "name", op: "IN", value: ["A", "B"] },
          { column: "qty", op: "BETWEEN", value: [1, 5] },
        ],
        limit: 10,
      },
      snap,
    );
    expect(out.sql).toMatch(/"name" IN \('A', 'B'\)/);
    expect(out.sql).toMatch(/"qty" BETWEEN 1 AND 5/);
    expect(out.sql).toMatch(/LIMIT 10/);
  });

  test("limit > 1000 强制 clamp 到 1000", () => {
    const dialect = new DuckDbDialect();
    const out = dialect.translate(
      {
        table: "data",
        groupBy: [],
        metrics: [],
        filters: [],
        limit: 5000,
      },
      snap,
    );
    expect(out.sql).toMatch(/LIMIT 1000/);
  });

  test("getDialect('duckdb-csv') 返回 DuckDbDialect", () => {
    expect(getDialect("duckdb-csv").type).toBe("duckdb-csv");
  });

  test("getDialect('postgres') 仍是 PostgresDialect(回归)", () => {
    expect(getDialect("postgres").type).toBe("postgres");
  });
});