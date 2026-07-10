import type { MetadataSnapshot } from "@workspace/types";

/**
 * [Sprint 1 / V3] Token 预算护栏
 * --------------------------------------------------------------
 * 把 MetadataSnapshot 序列化成可注入到 PlannerAgent system prompt
 * 的纯文本。外部数据源(尤其是 PG/MySQL 库)可能有几百张表,直接塞
 * 全部列定义会爆 token。
 *
 * 算法:
 *   1. 先序列化 "完整模式" (table + columns + sample values)
 *   2. 字符数 > budget: 第一轮砍 sample values
 *   3. 仍超: 删除最不"价值"的表 — 默认保留有大 cardinality 与
 *      measure 列的表,优先丢弃全 identifier 列的小表
 *   4. 仍超: 砍列 detail (保留列名 + 类型 + role)
 *   5. 设 truncated:true,提示 Planner "Schema truncated"
 *
 * 这与 sql-guard 正交 — sql-guard 守"执行",token-budget 守"决策"。
 * 两者一起防止 LLM 拿到不可控输入。
 */

export interface SerializeOptions {
  /** 字符上限,默认 6000(≈ 1500 tokens)。env 可覆盖。 */
  charBudget?: number;
}

/** 默认字符预算:6000 字符 ≈ 1500 tokens(粗估 GPT-4o 4 chars/token) */
export const DEFAULT_CHAR_BUDGET = 6000;

export interface SerializedSchema {
  text: string;
  truncated: boolean;
  charCount: number;
}

/**
 * 序列化入口(算法核心)。
 */
export function serializeForPrompt(
  snapshot: MetadataSnapshot,
  opts: SerializeOptions = {},
): SerializedSchema {
  const budget = opts.charBudget ?? DEFAULT_CHAR_BUDGET;

  // 第一轮:完整模式
  const rich = render(snapshot, { includeSamples: true, fullRole: true });
  if (rich.length <= budget) {
    return { text: rich, truncated: false, charCount: rich.length };
  }

  // 第二轮:砍 sample values
  const noSamples = render(snapshot, {
    includeSamples: false,
    fullRole: true,
  });
  if (noSamples.length <= budget) {
    return annotate({ text: noSamples, truncated: true, charCount: noSamples.length });
  }

  // 第三轮:按"价值"删表,直到 ≤ budget
  const tablesSorted = prioritizeTables(snapshot);
  let kept: typeof snapshot.tables = [];
  let accumulated = "";
  for (const t of tablesSorted) {
    const candidate = render(
      { ...snapshot, tables: [...kept, t] },
      { includeSamples: false, fullRole: true },
    );
    if (candidate.length <= budget) {
      kept.push(t);
      accumulated = candidate;
    } else {
      break;
    }
  }

  if (kept.length === 0) {
    // 至少保留第一张表的极简版(name + cols)
    const first = tablesSorted[0];
    if (first) {
      kept = [first];
      accumulated = render(
        { ...snapshot, tables: [first] },
        { includeSamples: false, fullRole: false },
      );
    }
  }

  return annotate({
    text: accumulated,
    truncated: true,
    charCount: accumulated.length,
  });
}

// ============================================================
// 内部:render / prioritizeTables / annotate
// ============================================================

interface RenderOpts {
  includeSamples: boolean;
  fullRole: boolean;
}

function render(snapshot: MetadataSnapshot, opts: RenderOpts): string {
  const lines: string[] = [];
  lines.push(`数据源 ${snapshot.dataSourceId}:`);
  for (const t of snapshot.tables) {
    // [Sprint 5.7] 表名中文含义
    const tableLabel = (t as any).chineseName
      ? ` (含义: ${(t as any).chineseName})`
      : "";
    lines.push(`  表名: ${t.name}${tableLabel}:`);
    for (const c of t.columns) {
      const role = opts.fullRole ? ` [${c.semanticRole}]` : "";
      const pk = c.isPrimaryKey ? " PK" : "";
      const fk = c.isForeignKey ? " FK" : "";
      const card =
        c.cardinality >= 0 && opts.fullRole
          ? ` (card=${c.cardinality})`
          : "";
      // [Sprint 5.7] 中文名 (比物理名更直观,帮 LLM 理解字段含义)
      const cnLabel = c.chineseName ? ` (${c.chineseName})` : "";
      const samples =
        opts.includeSamples && c.sampleValues.length > 0
          ? ` e.g. ${c.sampleValues.slice(0, 3).join(", ")}`
          : "";
      lines.push(
        `    - ${c.name}${cnLabel}: ${c.rawType}${role}${pk}${fk}${card}${samples}`,
      );
    }
  }
  return lines.join("\n");
}

/**
 * 表排序,越靠前越优先保留:有 measure 列 > 有 time 列 > 有 dimension。
 */
function prioritizeTables(snapshot: MetadataSnapshot): MetadataSnapshot["tables"] {
  const score = (t: MetadataSnapshot["tables"][number]): number => {
    let s = 0;
    for (const c of t.columns) {
      if (c.semanticRole === "measure") s += 10;
      else if (c.semanticRole === "time") s += 5;
      else if (c.semanticRole === "dimension") s += 3;
      else if (c.semanticRole === "identifier") s += 1;
      if (c.isPrimaryKey) s += 2;
      if (c.isForeignKey) s += 2;
    }
    return s;
  };
  return [...snapshot.tables].sort((a, b) => score(b) - score(a));
}

function annotate(s: SerializedSchema): SerializedSchema {
  if (s.truncated) {
    // 标记"被裁剪"以便 LLM 知道查询时主动调 get_table_details(尚无,Sprint 2 后)
    return {
      text: `${s.text}\n\n## Schema (truncated)\n## 提示:部分表/列未列出,需要时主动查询。`,
      truncated: true,
      charCount: s.text.length,
    };
  }
  return s;
}
