import { useState, useMemo } from 'react';
import type { SSESQLData } from '@workspace/types';

interface DataTableProps {
  /** Rows array from the SSE sql event */
  rows: SSESQLData['rows'];
  /** Column labels overrides, keyed by row key */
  columnLabels?: Record<string, string>;
}

const MAX_VISIBLE = 10;

/**
 * DataTable — renders SQL query results as a styled HTML table.
 *
 * Features:
 * - Auto-infers column headers from row keys
 * - Collapses rows beyond MAX_VISIBLE with "Show all N rows" toggle
 * - Numeric values are right-aligned and locale-formatted
 * - Handles empty rows gracefully
 */
export default function DataTable({ rows, columnLabels = {} }: DataTableProps) {
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? rows : rows?.slice(0, MAX_VISIBLE);
  const hasMore = (rows?.length ?? 0) > MAX_VISIBLE;

  if (!rows || rows.length === 0) {
    return (
      <div
        className="rounded-xl border px-4 py-3 text-xs italic"
        style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--bg-primary)' }}
      >
        查询结果为空
      </div>
    );
  }

  // Infer columns from first row
  const columns = useMemo(() => Object.keys(rows[0] as Record<string, unknown>), [rows]);

  const formatValue = (val: unknown): string => {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'number') {
      // Format as locale number; if it looks like money (whole numbers > 100), add ¥
      if (Number.isInteger(val) && Math.abs(val) >= 100) {
        return `¥${val.toLocaleString('zh-CN')}`;
      }
      return val.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
    }
    return String(val);
  };

  const isNumeric = (val: unknown): boolean =>
    typeof val === 'number';

  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
    >
      {/* Header row */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr
              style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)' }}
            >
              {columns.map((col) => (
                <th
                  key={col}
                  className=" whitespace-nowrap px-3 py-2 text-left font-medium"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {columnLabels[col] ?? col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible?.map((row, i) => {
              const r = row as Record<string, unknown>;
              return (
                <tr
                  key={i}
                  className="transition-colors"
                  style={{ borderBottom: i < visible.length - 1 ? '1px solid var(--border)' : 'none' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {columns.map((col) => (
                    <td
                      key={col}
                      className="whitespace-nowrap px-3 py-2"
                      style={{
                        color: 'var(--text-primary)',
                        textAlign: isNumeric(r[col]) ? 'right' : 'left',
                        fontFamily: isNumeric(r[col]) ? 'monospace' : 'inherit',
                      }}
                    >
                      {formatValue(r[col])}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Show all toggle */}
      {hasMore && (
        <button
          onClick={() => setShowAll((s) => !s)}
          className="w-full py-2 text-center text-xs transition-colors"
          style={{
            color: 'var(--accent)',
            borderTop: '1px solid var(--border)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          {showAll
            ? `收起`
            : `展开全部 ${rows.length} 条数据`}
        </button>
      )}
    </div>
  );
}
