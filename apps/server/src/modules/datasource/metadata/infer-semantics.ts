import type { ColumnMetadata, MetadataSnapshot } from "@workspace/types";

/**
 * [Sprint 1+2+3 / V3] 列语义推断 (纯函数,与 MetadataService 解耦)
 *
 * 推断规则(按优先级从高到低):
 *   1. PK → 'identifier' (永不与其他列参与聚合)
 *   2. numeric 类型 + 非 PK → 'measure'
 *   3. 含 ISO date/timestamp/time/datetime → 'time'
 *   4. [Sprint 3] 文本列且 sampleValues 体现"低基数" → 'dimension'
 *      (2-5 个 unique 值 → dimension,适合 groupBy)
 *   5. 其余 → 'identifier'
 *
 * 架构师 Sprint 3 实装要求:
 *   - 利用 Sprint 2 提取的 sampleValues 判断字段角色
 *   - 样本去重 2-5 → dimension
 *   - 全部数值 → measure (已被 numeric 规则覆盖,这里防御一下 sample 全数字)
 *   - 其余保持 identifier
 */
export function inferSemantics(snap: MetadataSnapshot): MetadataSnapshot {
  const tables = snap.tables.map(t => ({
    ...t,
    columns: t.columns.map(c => classifyColumn(c)),
  }));
  return { ...snap, tables };
}

/**
 * 阈值:sampleValues 数量在 [LOW_CARD_MIN, LOW_CARD_MAX] → dimension
 * - LOW_CARD_MIN = 2 表示至少有 2 种取值(单值列不算维度,常用作标签)
 * - LOW_CARD_MAX = 5 表示体验上 ≤5 类适合做维度(区域/产品类别/性别/状态)
 *
 *   > 5 → identifier(高基数字符串,例如 city / customer name 不适合做 groupBy)
 */
const LOW_CARD_MIN = 2;
const LOW_CARD_MAX = 5;

function classifyColumn(c: ColumnMetadata): ColumnMetadata {
  // [Sprint 3 防御] 已被外层(PG 端)显式声明的 role 不覆盖
  // (PG 端 inferSemantics 后,metric role 已被设置,digit 已经走 type 判定)
  if (c.semanticRole === "measure" || c.semanticRole === "time") {
    return c;
  }
  if (c.isPrimaryKey) {
    return { ...c, semanticRole: "identifier" };
  }

  const t = c.rawType.toLowerCase();
  // 1. ISO time → 'time'
  if (/\b(date|timestamp|time|datetime)\b/.test(t)) {
    return { ...c, semanticRole: "time" };
  }
  // 2. numeric → 'measure'
  if (
    /\b(int|integer|bigint|smallint|decimal|numeric|real|double|float|money)\b/.test(
      t,
    )
  ) {
    return { ...c, semanticRole: "measure" };
  }

  // 3. [Sprint 3] 文本列:
  //    - 如果 sampleValues 已枚举 2-5 个唯一值,且全部能在 prompt 中表明这是枚举
  //      → 'dimension'
  //    - 否则保留 identifier(但若 sample 完全是数值字符串如 "1" "2" → measure)
  const samples = c.sampleValues ?? [];
  if (samples.length >= LOW_CARD_MIN && samples.length <= LOW_CARD_MAX) {
    // 防御:样本全是数字字符串(CSV 数字列被 DuckDB 当作 VARCHAR)— 视为 measure
    const allNumeric = samples.every(s => /^-?\d+(\.\d+)?$/.test(String(s)));
    if (allNumeric) {
      return { ...c, semanticRole: "measure" };
    }
    return { ...c, semanticRole: "dimension" };
  }

  return c;
}