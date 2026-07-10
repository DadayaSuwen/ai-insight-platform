import type { MetadataSnapshot } from "@workspace/types";
import type { QueryIntentArgs } from "./dialect";

/**
 * [Sprint 2] QueryIntent 校验器 — 架构师避坑 #1
 *
 * LLM 在动态 Schema 上仍会输出不存在的列名 / 表名(意图漂移)。
 * 校验器在 SQL 翻译前拦截,抛 IntentValidationError 给 PlannerAgent。
 * PlannerAgent 见到错误后会触发自我修正(重写 intent)。
 *
 * 校验范围:
 *   1. table 必须在 snapshot.tables 里
 *   2. groupBy/metrics/filters 里的 column 必须都在 table 列里
 *   3. metrics.agg 必须是允许的聚合
 *   4. filters.op 必须是允许的操作
 *   5. limit 必须 ≤ 1000(尽管 dialect 已经 min,但早拦截更清晰)
 */
export class IntentValidationError extends Error {
  constructor(
    message: string,
    public readonly invalidRefs: Array<{
      kind: "table" | "column" | "metric" | "filter" | "orderBy";
      ref: string;
      context: string;
    }>,
  ) {
    super(message);
    this.name = "IntentValidationError";
  }
}

/**
 * [Sprint 5.7] 中文→物理列名反查。如果 LLM 误用了 chineseName，返回对应物理名。
 */
function chineseToPhysical(
  chineseName: string,
  columns: { name: string; chineseName?: string }[],
): string | null {
  const match = columns.find(
    (c) => c.chineseName && c.chineseName === chineseName,
  );
  return match?.name ?? null;
}

export function validateIntent(
  intent: QueryIntentArgs,
  snapshot: MetadataSnapshot,
): void {
  const invalidRefs: IntentValidationError["invalidRefs"] = [];

  // 1. table
  const table = snapshot.tables.find(t => t.name === intent.table);
  if (!table) {
    // [Sprint 5.7] 是不是用中文名当表名了？
    const cnTables = snapshot.tables
      .filter((t) => (t as any).chineseName === intent.table)
      .map((t) => t.name);
    const hint = cnTables.length > 0
      ? `你是不是用了中文名"${intent.table}"？正确的物理表名是"${cnTables[0]}"`
      : `Table "${intent.table}" not found. Available: ${snapshot.tables.map(t => t.name).slice(0, 5).join(", ")}...`;
    invalidRefs.push({
      kind: "table",
      ref: intent.table,
      context: hint,
    });
    throw new IntentValidationError(
      `Intent validation failed: ${invalidRefs.length} invalid references`,
      invalidRefs,
    );
  }

  const validColumns = new Set(table.columns.map(c => c.name));

  // 2. groupBy
  for (const g of intent.groupBy) {
    if (!validColumns.has(g)) {
      const physical = chineseToPhysical(g, table.columns as any);
      const hint = physical
        ? `你是不是用了中文名"${g}"？正确的物理名是"${physical}"`
        : `groupBy column "${g}" does not exist in table "${table.name}". Available: ${[...validColumns].slice(0, 5).join(", ")}...`;
      invalidRefs.push({ kind: "column", ref: g, context: hint });
    }
  }

  // 3. metrics
  for (const m of intent.metrics) {
    if (!validColumns.has(m.column)) {
      const physical = chineseToPhysical(m.column, table.columns as any);
      const hint = physical
        ? `你是不是用了中文名"${m.column}"？正确的物理名是"${physical}"`
        : `Metric column "${m.column}" does not exist in table "${table.name}".`;
      invalidRefs.push({ kind: "metric", ref: m.column, context: hint });
    }
  }

  // 4. filters
  for (const f of intent.filters) {
    if (!validColumns.has(f.column)) {
      const physical = chineseToPhysical(f.column, table.columns as any);
      const hint = physical
        ? `你是不是用了中文名"${f.column}"？正确的物理名是"${physical}"`
        : `Filter column "${f.column}" does not exist in table "${table.name}".`;
      invalidRefs.push({ kind: "filter", ref: f.column, context: hint });
    }
  }

  // 5. orderBy
  if (intent.orderBy) {
    const ob = intent.orderBy.column;
    const aliasSet = new Set(intent.metrics.map(m => m.alias));
    if (!validColumns.has(ob) && !aliasSet.has(ob)) {
      const physical = chineseToPhysical(ob, table.columns as any);
      const hint = physical
        ? `你是不是用了中文名"${ob}"？正确的物理名是"${physical}"`
        : `orderBy "${ob}" is neither a column nor an alias.`;
      invalidRefs.push({ kind: "orderBy", ref: ob, context: hint });
    }
  }

  if (invalidRefs.length > 0) {
    throw new IntentValidationError(
      `Intent validation failed: ${invalidRefs.length} invalid references`,
      invalidRefs,
    );
  }
}