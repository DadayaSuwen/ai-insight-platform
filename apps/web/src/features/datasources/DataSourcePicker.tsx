import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listDataSources, type DataSourceListItem } from './api';

/**
 * [Sprint 3 / V3] 数据源徽标选择器
 *
 * Dropdown 形式放在 ChatWindow header 上方:
 *   - 当前选中数据源
 *   - 点击展开列表,显示所有 active 数据源 + 跳转 Settings 链接
 *   - 选中后调用 onChange(dataSourceId) 让父级创建 session 时 binding
 */

interface Props {
  value: string | null;
  onChange: (dataSourceId: string) => void;
}

const TYPE_LABEL: Record<string, string> = {
  postgres: 'PG',
  mysql: 'MY',
  'duckdb-csv': 'CSV',
};

export default function DataSourcePicker({ value, onChange }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<DataSourceListItem[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 首次挂载时加载列表, 保证 label 始终反映当前选中项
  useEffect(() => {
    listDataSources()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  // 每次打开下拉时刷新列表
  useEffect(() => {
    if (!open) return;
    listDataSources()
      .then(setItems)
      .catch(() => setItems([]));
  }, [open]);

  // 点击外面关闭
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const current = items.find(it => it.id === value);
  const label = current ? current.name : (items.length === 0 ? '无数据源' : '选择数据源');
  const type = current?.type ?? 'postgres';

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors"
        style={{
          background: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
          color: 'var(--text-secondary)',
        }}
        title="选择数据源"
      >
        <span
          className="rounded px-1 py-0.5 text-[9px] font-bold"
          style={{
            background:
              type === 'duckdb-csv'
                ? '#FCBF0030'
                : type === 'mysql'
                  ? '#4479A130'
                  : '#33679130',
            color:
              type === 'duckdb-csv' ? '#B07D00' : type === 'mysql' ? '#4479A1' : '#336791',
          }}
        >
          {TYPE_LABEL[type] ?? type.slice(0, 3).toUpperCase()}
        </span>
        <span className="max-w-[120px] truncate">{label}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-72 rounded-xl border shadow-lg"
          style={{
            background: 'var(--bg-primary)',
            borderColor: 'var(--border)',
          }}
        >
          <p
            className="border-b px-3 py-2 text-[10px] font-medium"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--text-muted)',
            }}
          >
            选择数据源(下次发问生效)
          </p>
          <div className="max-h-72 overflow-y-auto py-1">
            {items.length === 0 ? (
              <p className="px-3 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                加载中... (若一直为空,请到 Settings 上传 CSV)
              </p>
            ) : (
              items.map(ds => {
                const isActive = ds.id === value;
                return (
                  <button
                    key={ds.id}
                    onClick={() => {
                      onChange(ds.id);
                      setOpen(false);
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors"
                    style={{
                      background: isActive ? 'var(--accent-light)' : 'transparent',
                    }}
                  >
                    <div className="min-w-0">
                      <p
                        className="truncate text-xs font-medium"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {ds.name}
                      </p>
                      <p
                        className="text-[10px]"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {ds.id}
                      </p>
                    </div>
                    <span
                      className="rounded px-1 py-0.5 text-[9px] font-bold"
                      style={{
                        background:
                          ds.type === 'duckdb-csv'
                            ? '#FCBF0030'
                            : ds.type === 'mysql'
                              ? '#4479A130'
                              : '#33679130',
                        color:
                          ds.type === 'duckdb-csv'
                            ? '#B07D00'
                            : ds.type === 'mysql'
                              ? '#4479A1'
                              : '#336791',
                      }}
                    >
                      {TYPE_LABEL[ds.type] ?? ds.type.slice(0, 3).toUpperCase()}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <div
            className="border-t px-3 py-2"
            style={{ borderColor: 'var(--border)' }}
          >
            <button
              onClick={() => {
                setOpen(false);
                navigate('/datasources');
              }}
              className="w-full rounded-md py-1.5 text-[10px]"
              style={{
                background: 'transparent',
                color: 'var(--accent)',
                border: '1px solid var(--border)',
              }}
            >
              + 管理数据源 →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}