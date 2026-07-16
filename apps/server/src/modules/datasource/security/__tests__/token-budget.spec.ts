import {
  serializeForPrompt,
  DEFAULT_CHAR_BUDGET,
} from "../token-budget";
import type { MetadataSnapshot, TableMetadata } from "@workspace/types";

function makeSnapshot(tables: TableMetadata[]): MetadataSnapshot {
  return {
    dataSourceId: "ds-x",
    fetchedAt: new Date().toISOString(),
    tables,
    tokenEstimate: 0,
    truncated: false,
  };
}

function makeTable(name: string, nCols: number): TableMetadata {
  return {
    name,
    columns: Array.from({ length: nCols }, (_, i) => ({
      name: `col_${i}`,
      rawType: i % 2 === 0 ? "text" : "numeric",
      semanticRole:
        i % 4 === 0
          ? ("dimension" as const)
          : i % 4 === 1
            ? ("measure" as const)
            : i % 4 === 2
              ? ("time" as const)
              : ("identifier" as const),
      cardinality: 10 + i,
      sampleValues:
        i % 4 === 0 ? ["a", "b", "c", "d"] : [],
      isPrimaryKey: i === 0,
      isForeignKey: false,
    })),
  };
}

describe("[Sprint 1 / V3] token-budget", () => {
  test("小快照不截断", () => {
    const snap = makeSnapshot([makeTable("customers", 5)]);
    const out = serializeForPrompt(snap, { charBudget: 2000 });
    expect(out.truncated).toBe(false);
    expect(out.text).toContain("customers");
    expect(out.charCount).toBeLessThanOrEqual(2000);
  });

  test("大快照需要截断 (200 张表)", () => {
    const tables = Array.from({ length: 200 }, (_, i) =>
      makeTable(`T${i}`, 10),
    );
    const snap = makeSnapshot(tables);
    const out = serializeForPrompt(snap, { charBudget: 1000 });
    expect(out.truncated).toBe(true);
    expect(out.text).toMatch(/## Schema \(truncated\)/);
    // 截断后字符应远小于未截断
    const fullSize = serializeForPrompt(snap, { charBudget: 1_000_000 }).text
      .length;
    expect(out.text.length).toBeLessThan(fullSize);
  });

  test("字符预算无限大时输出全部", () => {
    const tables = Array.from({ length: 5 }, (_, i) =>
      makeTable(`T${i}`, 8),
    );
    const snap = makeSnapshot(tables);
    const out = serializeForPrompt(snap, { charBudget: 100_000 });
    expect(out.truncated).toBe(false);
    expect(out.text).toContain("T0");
    expect(out.text).toContain("T4");
  });

  test("使用默认预算 (≈ 6000 chars)", () => {
    const tables = Array.from({ length: 10 }, (_, i) =>
      makeTable(`T${i}`, 6),
    );
    const snap = makeSnapshot(tables);
    const out = serializeForPrompt(snap);
    expect(out.charCount).toBeLessThanOrEqual(DEFAULT_CHAR_BUDGET);
  });

  test("包含 sample values 在 rich 模式", () => {
    const snap = makeSnapshot([makeTable("customers", 4)]);
    const out = serializeForPrompt(snap, { charBudget: 100_000 });
    expect(out.text).toContain("e.g.");
  });

  test("rich 模式默认 < 4000 字符的简单 schema", () => {
    const snap = makeSnapshot([makeTable("orders", 8)]);
    const out = serializeForPrompt(snap, { charBudget: 4000 });
    expect(out.truncated).toBe(false);
    expect(out.text).toContain("orders");
  });
});
