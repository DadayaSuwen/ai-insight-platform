import { useState } from 'react';

interface HistoryEvent {
  id: string;
  ts: string;
  badge: string;
  datasource: string;
  detail: string;
  status: 'success' | 'warning';
}

const EVENTS: HistoryEvent[] = [
  { id: '1', ts: '2026-07-14 14:32', badge: '首次接入', datasource: 'ecommerce_db', detail: '发现 8 张表 · 67 字段 · 用户确认 4 字段', status: 'success' },
  { id: '2', ts: '2026-07-14 14:30', badge: '连接测试', datasource: 'ecommerce_db', detail: 'postgresql://192.168.1.100:5432 · 延迟 18ms', status: 'success' },
  { id: '3', ts: '2026-07-12 10:15', badge: 'Schema 修订', datasource: 'test_db (已删除)', detail: '用户修正 2 个字段含义', status: 'warning' },
  { id: '4', ts: '2026-07-10 09:48', badge: '首次接入', datasource: 'test_db (已删除)', detail: '发现 3 张表 · 18 字段', status: 'success' },
];

const BADGE_STYLES: Record<string, { bg: string; color: string }> = {
  '首次接入': { bg: 'var(--green-light)', color: 'var(--green-darker)' },
  '连接测试': { bg: 'var(--bg-secondary)', color: 'var(--text-secondary)' },
  'Schema 修订': { bg: 'var(--warning-light)', color: 'var(--warning)' },
};

/**
 * [Sprint 6] 探索历史页 — 时间线列表
 */
export default function HistoryPage() {
  const [filter, setFilter] = useState<'all' | 'connect' | 'review'>('all');

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">探索历史</h1>
          <p className="page-subtitle">所有数据源接入与 Schema 修订记录</p>
        </div>
      </div>

      {/* 筛选 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          { id: 'all', label: '全部' },
          { id: 'connect', label: '接入' },
          { id: 'review', label: 'Schema 修订' },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id as 'all' | 'connect' | 'review')}
            className="btn"
            style={{
              background: filter === f.id ? 'var(--green-dark)' : 'var(--bg-secondary)',
              color: filter === f.id ? 'white' : 'var(--text-secondary)',
              border: '1px solid var(--border)',
              padding: '5px 12px',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 时间线 */}
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>时间</th><th>事件</th><th>数据源</th><th>详情</th><th>状态</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            {EVENTS.map((event) => {
              const style = BADGE_STYLES[event.badge] ?? BADGE_STYLES['连接测试'];
              return (
                <tr key={event.id}>
                  <td className="num" style={{ fontSize: 12 }}>{event.ts}</td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        background: style.bg,
                        color: style.color,
                      }}
                    >
                      {event.badge}
                    </span>
                  </td>
                  <td>{event.datasource}</td>
                  <td>{event.detail}</td>
                  <td>
                    <span
                      className={event.status === 'success' ? 'status-dot' : 'status-dot warning'}
                    >
                      {event.status === 'success' ? '完成' : '警告'}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm">查看</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
