import {
  validateIntent,
  IntentValidationError,
} from "../intent-validator";
import type { MetadataSnapshot, TableMetadata } from "@workspace/types";
import type { QueryIntentArgs } from "../dialect";

function makeSnap(tables: TableMetadata[]): MetadataSnapshot {
  return {
    dataSourceId: "test",
    fetchedAt: new Date().toISOString(),
    tables,
    tokenEstimate: 0,
    truncated: false,
  };
}

const testSnap = makeSnap([
  {
    name: "order_items",
    columns: [
      { name: "id", rawType: "text", semanticRole: "identifier", cardinality: 10000, sampleValues: [], isPrimaryKey: true, isForeignKey: false },
      { name: "sales", rawType: "numeric", semanticRole: "measure", cardinality: -1, sampleValues: [], isPrimaryKey: false, isForeignKey: false },
      { name: "quantity", rawType: "integer", semanticRole: "measure", cardinality: -1, sampleValues: [], isPrimaryKey: false, isForeignKey: false },
      { name: "profit", rawType: "double precision", semanticRole: "measure", cardinality: -1, sampleValues: [], isPrimaryKey: false, isForeignKey: false },
      { name: "discount", rawType: "double precision", semanticRole: "measure", cardinality: -1, sampleValues: [], isPrimaryKey: false, isForeignKey: false },
      { name: "orderId", rawType: "text", semanticRole: "identifier", cardinality: 5000, sampleValues: [], isPrimaryKey: false, isForeignKey: true, referencesTable: "orders", referencesColumn: "id" },
      { name: "productId", rawType: "text", semanticRole: "identifier", cardinality: 1862, sampleValues: [], isPrimaryKey: false, isForeignKey: true, referencesTable: "Product", referencesColumn: "id" },
    ],
    fkHints: [],
  },
  {
    name: "customers",
    columns: [
      { name: "id", rawType: "text", semanticRole: "identifier", cardinality: 1000, sampleValues: [], isPrimaryKey: true, isForeignKey: false },
      { name: "name", rawType: "text", semanticRole: "identifier", cardinality: 1000, sampleValues: [], isPrimaryKey: false, isForeignKey: false },
      { name: "region", rawType: "text", semanticRole: "dimension", cardinality: 7, sampleValues: ["华东", "华南", "华中"], isPrimaryKey: false, isForeignKey: false },
    ],
    fkHints: [],
  },
]);

describe("[Sprint 2 / V3] validateIntent", () => {
  test("合法 intent 不抛错", () => {
    const intent: QueryIntentArgs = {
      table: "order_items",
      groupBy: [],
      metrics: [
        { column: "sales", agg: "SUM", alias: "total_sales", label: "总销售额" },
      ],
      filters: [],
      limit: 10,
    };
    expect(() => validateIntent(intent, testSnap)).not.toThrow();
  });

  test("table 不存在 → 抛 IntentValidationError", () => {
    const intent: QueryIntentArgs = {
      table: "NotExistTable",
      groupBy: [],
      metrics: [],
      filters: [],
      limit: 10,
    };
    expect(() => validateIntent(intent, testSnap)).toThrow(
      IntentValidationError,
    );
  });

  test("groupBy 引用不存在列 → 抛错 + 列出可选项", () => {
    const intent: QueryIntentArgs = {
      table: "order_items",
      groupBy: ["city"],
      metrics: [],
      filters: [],
      limit: 10,
    };
    try {
      validateIntent(intent, testSnap);
      fail("expected to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(IntentValidationError);
      const err = e as IntentValidationError;
      expect(err.invalidRefs.length).toBe(1);
      expect(err.invalidRefs[0].kind).toBe("column");
      expect(err.invalidRefs[0].ref).toBe("city");
    }
  });

  test("metrics 引用不存在列 → 抛错", () => {
    const intent: QueryIntentArgs = {
      table: "order_items",
      groupBy: [],
      metrics: [
        { column: "non_existent_col", agg: "SUM", alias: "x", label: "x" },
      ],
      filters: [],
      limit: 10,
    };
    expect(() => validateIntent(intent, testSnap)).toThrow(
      IntentValidationError,
    );
  });

  test("filters 引用不存在列 → 抛错", () => {
    const intent: QueryIntentArgs = {
      table: "order_items",
      groupBy: [],
      metrics: [],
      filters: [
        { column: "ghost_field", op: "=", value: "x" },
      ],
      limit: 10,
    };
    expect(() => validateIntent(intent, testSnap)).toThrow(
      IntentValidationError,
    );
  });

  test("orderBy 引用 alias → 通过", () => {
    const intent: QueryIntentArgs = {
      table: "order_items",
      groupBy: [],
      metrics: [
        { column: "sales", agg: "SUM", alias: "total_sales", label: "总销售额" },
      ],
      filters: [],
      orderBy: { column: "total_sales", direction: "DESC" },
      limit: 10,
    };
    expect(() => validateIntent(intent, testSnap)).not.toThrow();
  });

  test("orderBy 引用 ghost → 抛错", () => {
    const intent: QueryIntentArgs = {
      table: "order_items",
      groupBy: [],
      metrics: [
        { column: "sales", agg: "SUM", alias: "total_sales", label: "总销售额" },
      ],
      filters: [],
      orderBy: { column: "ghost", direction: "DESC" },
      limit: 10,
    };
    expect(() => validateIntent(intent, testSnap)).toThrow(
      IntentValidationError,
    );
  });

  test("跨表 groupBy (引用其他表的列) → 抛错", () => {
    // LLM 可能犯的错:在 order_items 表上 groupBy customers.region (跨表)
    // validateIntent 严格按 table 列名校验 → 应抛
    const intent: QueryIntentArgs = {
      table: "order_items",
      groupBy: ["region"], // region 在 users,不在 order_items
      metrics: [],
      filters: [],
      limit: 10,
    };
    expect(() => validateIntent(intent, testSnap)).toThrow(
      IntentValidationError,
    );
  });
});