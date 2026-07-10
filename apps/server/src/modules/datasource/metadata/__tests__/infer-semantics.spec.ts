import type { ColumnMetadata, MetadataSnapshot } from "@workspace/types";
import { inferSemantics } from "../infer-semantics";

/**
 * [Sprint 3] inferSemantics 增强单测 — 架构师 Sprint 3 实装要求:
 *   - 文本列 + sample 2-5 唯一值 → dimension
 *   - 文本列 + sample 全是数字字符串 → measure (防御 CSV 列被错认为 VARCHAR)
 *   - PK → identifier
 *   - numeric/time 一如既往
 */

function col(partial: Partial<ColumnMetadata>): ColumnMetadata {
  return {
    name: "x",
    rawType: "text",
    semanticRole: "identifier",
    cardinality: -1,
    sampleValues: [],
    isPrimaryKey: false,
    isForeignKey: false,
    ...partial,
  };
}

function tableOf(columns: ColumnMetadata[]) {
  return {
    name: "data",
    columns,
    fkHints: [],
  };
}

describe("[Sprint 3 / V3] inferSemantics 文本列 → dimension 实装", () => {
  test("2-5 个 sample values → dimension", () => {
    const snap: MetadataSnapshot = {
      dataSourceId: "csv-test",
      fetchedAt: new Date().toISOString(),
      tables: [tableOf([
        col({ name: "status", rawType: "VARCHAR", sampleValues: ["paid", "pending", "cancelled"] }),
      ])],
      tokenEstimate: 0,
      truncated: false,
    };
    const out = inferSemantics(snap);
    expect(out.tables[0].columns[0].semanticRole).toBe("dimension");
  });

  test("sample 全是数字字符串 → measure (DuckDB 把 INT 错当 VARCHAR 时防御)", () => {
    const snap: MetadataSnapshot = {
      dataSourceId: "csv-test",
      fetchedAt: new Date().toISOString(),
      tables: [tableOf([
        col({ name: "qty", rawType: "VARCHAR", sampleValues: ["1", "2", "3"] }),
      ])],
      tokenEstimate: 0,
      truncated: false,
    };
    const out = inferSemantics(snap);
    expect(out.tables[0].columns[0].semanticRole).toBe("measure");
  });

  test("1 个 sample value → 保持 identifier (单值列不当维度)", () => {
    const snap: MetadataSnapshot = {
      dataSourceId: "csv-test",
      fetchedAt: new Date().toISOString(),
      tables: [tableOf([
        col({ name: "country", rawType: "VARCHAR", sampleValues: ["US"] }),
      ])],
      tokenEstimate: 0,
      truncated: false,
    };
    const out = inferSemantics(snap);
    expect(out.tables[0].columns[0].semanticRole).toBe("identifier");
  });

  test("6+ 个 sample → identifier (高基数字符串,如 city)", () => {
    const snap: MetadataSnapshot = {
      dataSourceId: "csv-test",
      fetchedAt: new Date().toISOString(),
      tables: [tableOf([
        col({
          name: "city",
          rawType: "VARCHAR",
          sampleValues: ["北京", "上海", "广州", "深圳", "杭州", "成都"],
        }),
      ])],
      tokenEstimate: 0,
      truncated: false,
    };
    const out = inferSemantics(snap);
    expect(out.tables[0].columns[0].semanticRole).toBe("identifier");
  });

  test("numeric rawType 直接走 measure (Sprint 2 规则保留)", () => {
    const snap: MetadataSnapshot = {
      dataSourceId: "csv-test",
      fetchedAt: new Date().toISOString(),
      tables: [tableOf([
        col({ name: "amount", rawType: "DOUBLE", sampleValues: [] }),
      ])],
      tokenEstimate: 0,
      truncated: false,
    };
    const out = inferSemantics(snap);
    expect(out.tables[0].columns[0].semanticRole).toBe("measure");
  });

  test("timestamp rawType → time", () => {
    const snap: MetadataSnapshot = {
      dataSourceId: "csv-test",
      fetchedAt: new Date().toISOString(),
      tables: [tableOf([
        col({ name: "ts", rawType: "TIMESTAMP", sampleValues: [] }),
      ])],
      tokenEstimate: 0,
      truncated: false,
    };
    const out = inferSemantics(snap);
    expect(out.tables[0].columns[0].semanticRole).toBe("time");
  });

  test("PK 永远 identifier", () => {
    const snap: MetadataSnapshot = {
      dataSourceId: "csv-test",
      fetchedAt: new Date().toISOString(),
      tables: [tableOf([
        col({ name: "id", rawType: "INTEGER", isPrimaryKey: true }),
      ])],
      tokenEstimate: 0,
      truncated: false,
    };
    const out = inferSemantics(snap);
    expect(out.tables[0].columns[0].semanticRole).toBe("identifier");
  });

  test("已显式声明 measure/time 不覆盖", () => {
    const snap: MetadataSnapshot = {
      dataSourceId: "csv-test",
      fetchedAt: new Date().toISOString(),
      tables: [tableOf([
        col({
          name: "kpi",
          rawType: "VARCHAR",
          sampleValues: ["1", "2", "3"],
          semanticRole: "measure", // 模拟 PG 端已设
        }),
      ])],
      tokenEstimate: 0,
      truncated: false,
    };
    const out = inferSemantics(snap);
    expect(out.tables[0].columns[0].semanticRole).toBe("measure");
  });
});