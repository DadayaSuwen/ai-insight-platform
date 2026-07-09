import { useState } from "react";

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
}: {
  rows: Array<Record<string, unknown>>;
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
    // 未来如果有新字段，只需在这里加映射即可
  };

  return (
    <div className="relative mt-2">
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
                  {headerMap[h] || h}
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

                  // 健壮的数字判断:支持原生 number 和纯数字字符串
                  const isNum =
                    (typeof val === "number" && !isNaN(val)) ||
                    (typeof val === "string" &&
                      val.trim() !== "" &&
                      !isNaN(Number(val)));

                  return (
                    <td
                      key={h}
                      className={`px-3 py-2 whitespace-nowrap tabular-nums text-left`}
                    >
                      {isNum
                        ? Number(val).toLocaleString()
                        : String(val ?? "-")}
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