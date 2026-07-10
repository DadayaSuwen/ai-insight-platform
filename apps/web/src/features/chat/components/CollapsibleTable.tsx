import { useState, useCallback } from "react";
import { formatCellValue } from "../../../lib/format-value";

/**
 * [M13-V2] GUARD-V2-3: CollapsibleTable
 *
 * 从 MessageBubble.tsx 抽出的表格组件,供 ChartErrorBoundary 内联渲染使用。
 * - 自动提取表头 (rows[0] 的所有 key)
 * - 表头友好映射 (英文 key → 中文展示)
 * - 数字千分位格式化
 * - >8 行可折叠
 */
export function CollapsibleTable({
  rows,
  fieldMapping,
}: {
  rows: Array<Record<string, unknown>>;
  /** [Sprint 5.7] 物理名 → 中文名映射表,优先级高于 headerMap */
  fieldMapping?: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!rows || rows.length === 0) return null;

  const headers = Object.keys(rows[0]);

  const headerMap: Record<string, string> = {
    key: "分组/时间",
    name: "名称",
    totalAmount: "销售额 (¥)",
    totalQuantity: "销量",
    orderCount: "订单数",
    value: "数值",
    sales: "销售额",
    quantity: "销量",
    profit: "利润",
    discount: "平均折扣率",
  };

  const cnLabel = (key: string) =>
    fieldMapping?.[key] ?? headerMap[key] ?? key;

  // 表头显示: "物理名 (中文名)"
  const displayHeader = (key: string) => {
    const cn = fieldMapping?.[key] ?? headerMap[key];
    return cn && cn !== key ? `${key} (${cn})` : key;
  };

  // [Sprint 5.7+] 导出 CSV
  const exportCSV = useCallback(() => {
    const headerRow = headers.map(cnLabel).join(",");
    const dataRows = rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          if (val == null) return "";
          const str = String(val);
          // 含逗号/换行/引号时用双引号包裹
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(","),
    );
    const csv = "﻿" + [headerRow, ...dataRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rows, headers, fieldMapping]);

  return (
    <div className="relative mt-2">
      {/* 导出按钮 */}
      <div className="mb-1 flex justify-end">
        <button
          onClick={exportCSV}
          className="flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] transition-colors hover:opacity-80"
          style={{
            borderColor: "var(--border)",
            background: "var(--bg-secondary)",
            color: "var(--text-secondary)",
          }}
          title="导出 CSV (中文表头)"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          导出 CSV
        </button>
      </div>
      <div
        className="overflow-auto rounded-lg border transition-all"
        style={{
          borderColor: "var(--border)",
          maxHeight: expanded ? "none" : "380px",
        }}
      >
        <table className="w-full text-xs">
          <thead
            style={{ background: "var(--bg-hover)" }}
            className="sticky top-0"
          >
            <tr>
              {headers.map((h) => (
                <th
                  key={h}
                  className="px-3 py-2 text-left font-medium whitespace-nowrap"
                >
                  {displayHeader(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ridx) => (
              <tr
                key={ridx}
                className="border-t"
                style={{ borderColor: "var(--border)" }}
              >
                {headers.map((h) => {
                  const val = row[h];
                  return (
                    <td
                      key={h}
                      className={`px-3 py-2 whitespace-nowrap tabular-nums text-left`}
                    >
                      {formatCellValue(val)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > 8 && (
        <div
          className="flex justify-center py-1.5 border-t"
          style={{
            borderColor: "var(--border)",
            background: "var(--bg-primary)",
          }}
        >
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-medium hover:underline"
            style={{ color: "var(--accent)" }}
          >
            {expanded ? "⬆ 收起表格" : `⬇ 展开全部 (${rows.length} 行)`}
          </button>
        </div>
      )}
    </div>
  );
}

export default CollapsibleTable;