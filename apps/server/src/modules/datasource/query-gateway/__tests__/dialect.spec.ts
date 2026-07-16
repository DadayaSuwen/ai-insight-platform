import { getDialect, type QueryIntentArgs } from "../dialect";
import type { MetadataSnapshot, TableMetadata } from "@workspace/types";

const snap: MetadataSnapshot = {
  dataSourceId: "test",
  fetchedAt: new Date().toISOString(),
  tables: [
    {
      name: "order_items",
      columns: [
        { name: "id", rawType: "text", semanticRole: "identifier", cardinality: 10000, sampleValues: [], isPrimaryKey: true, isForeignKey: false },
        { name: "sales", rawType: "numeric", semanticRole: "measure", cardinality: -1, sampleValues: [], isPrimaryKey: false, isForeignKey: false },
        { name: "quantity", rawType: "integer", semanticRole: "measure", cardinality: -1, sampleValues: [], isPrimaryKey: false, isForeignKey: false },
        { name: "profit", rawType: "double precision", semanticRole: "measure", cardinality: -1, sampleValues: [], isPrimaryKey: false, isForeignKey: false },
        { name: "orderId", rawType: "text", semanticRole: "identifier", cardinality: 5000, sampleValues: [], isPrimaryKey: false, isForeignKey: true },
      ],
      fkHints: [],
    },
  ] as TableMetadata[],
  tokenEstimate: 0,
  truncated: false,
};

describe("[Sprint 2 / V3] PostgresDialect.translate (golden file)", () => {
  const pg = getDialect("postgres");

  test("聚合: SUM + GROUP BY → 标准 SQL", () => {
    const intent: QueryIntentArgs = {
      table: "order_items",
      groupBy: [],
      metrics: [
        { column: "sales", agg: "SUM", alias: "total_sales", label: "总销售额" },
        { column: "quantity", agg: "SUM", alias: "total_qty", label: "总销量" },
      ],
      filters: [],
      limit: 100,
    };
    const out = pg.translate(intent, snap);
    expect(out.sql).toContain("SELECT SUM(\"sales\") AS \"total_sales\"");
    expect(out.sql).toContain("SUM(\"quantity\") AS \"total_qty\"");
    expect(out.sql).toContain('FROM "order_items"');
    expect(out.sql).toContain("LIMIT 100");
    // 没设 orderBy 但 metrics 非空 → 默认按首个 alias DESC
    expect(out.sql).toContain('ORDER BY "total_sales" DESC');
  });

  test("聚合: GROUP BY region", () => {
    const intent: QueryIntentArgs = {
      table: "order_items",
      groupBy: ["orderId"],
      metrics: [
        { column: "profit", agg: "SUM", alias: "total_profit", label: "总利润" },
      ],
      filters: [],
      limit: 50,
    };
    const out = pg.translate(intent, snap);
    expect(out.sql).toContain('GROUP BY "orderId"');
    expect(out.sql).toContain('ORDER BY "total_profit" DESC');
    expect(out.sql).toContain("LIMIT 50");
  });

  test("filter: = with string", () => {
    const intent: QueryIntentArgs = {
      table: "order_items",
      groupBy: [],
      metrics: [{ column: "sales", agg: "SUM", alias: "s", label: "销售额" }],
      filters: [{ column: "orderId", op: "=", value: "ord-1" }],
      limit: 10,
    };
    const out = pg.translate(intent, snap);
    expect(out.sql).toContain("WHERE \"orderId\" = 'ord-1'");
  });

  test("filter: BETWEEN with two numbers", () => {
    const intent: QueryIntentArgs = {
      table: "order_items",
      groupBy: [],
      metrics: [{ column: "sales", agg: "SUM", alias: "s", label: "s" }],
      filters: [{ column: "quantity", op: "BETWEEN", value: [1, 100] }],
      limit: 10,
    };
    const out = pg.translate(intent, snap);
    expect(out.sql).toContain("WHERE \"quantity\" BETWEEN 1 AND 100");
  });

  test("filter: IN with array", () => {
    const intent: QueryIntentArgs = {
      table: "order_items",
      groupBy: [],
      metrics: [{ column: "sales", agg: "SUM", alias: "s", label: "s" }],
      filters: [{ column: "orderId", op: "IN", value: ["a", "b", "c"] }],
      limit: 10,
    };
    const out = pg.translate(intent, snap);
    expect(out.sql).toContain("WHERE \"orderId\" IN ('a', 'b', 'c')");
  });

  test("filter: SQL injection 字符串 (含 quote) → 抛错", () => {
    const intent: QueryIntentArgs = {
      table: "order_items",
      groupBy: [],
      metrics: [{ column: "sales", agg: "SUM", alias: "s", label: "s" }],
      filters: [{ column: "orderId", op: "=", value: "'; DROP TABLE x; --" }],
      limit: 10,
    };
    expect(() => pg.translate(intent, snap)).toThrow(/forbidden chars/i);
  });

  test("limit > 1000 → 强制 ≤ 1000 (与 gateway 一致)", () => {
    const intent: QueryIntentArgs = {
      table: "order_items",
      groupBy: [],
      metrics: [],
      filters: [],
      limit: 99999,
    };
    const out = pg.translate(intent, snap);
    expect(out.sql).toContain("LIMIT 1000");
  });

  test("orderBy 显式传", () => {
    const intent: QueryIntentArgs = {
      table: "order_items",
      groupBy: [],
      metrics: [{ column: "sales", agg: "SUM", alias: "s", label: "s" }],
      filters: [],
      orderBy: { column: "s", direction: "ASC" },
      limit: 10,
    };
    const out = pg.translate(intent, snap);
    expect(out.sql).toContain('ORDER BY "s" ASC');
  });

  test("[Sprint 4] MySQL dialect 已实装 → 不抛错 + 反引号", () => {
    const mysql = getDialect("mysql");
    // Sprint 4:应该正常返回 SQL,不再抛 'later Sprint'
    const out = mysql.translate(
      {
        table: "x",
        groupBy: [],
        metrics: [],
        filters: [],
        limit: 10,
      },
      snap,
    );
    expect(out.sql).toContain('FROM `x`');
    expect(out.sql).toMatch(/LIMIT 10/);
  });

  test("[Sprint 3] DuckDB dialect 已实装 → 不抛错", () => {
    const duck = getDialect("duckdb-csv");
    // Sprint 3:应该正常返回 SQL,不再抛 'later Sprint' / 'Sprint 3'
    const out = duck.translate(
      {
        table: "x",
        groupBy: [],
        metrics: [],
        filters: [],
        limit: 10,
      },
      snap,
    );
    expect(out.sql).toContain('FROM "x"');
    expect(out.sql).toMatch(/LIMIT 10/);
  });
});