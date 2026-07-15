/**
 * [Fix-7 Task 7.14] 探索历史页 — 1:1 还原原型 PAGES.history (pages.js L1136-1149)
 *
 * Mock 4 行历史记录 (硬编码, 不调 API)
 */
interface HistoryRow {
  time: string;
  type: '首次接入' | '连接测试' | 'Schema 修订';
  badge: 'success' | 'warning' | 'normal';
  ds: string;
  detail: string;
  status: string;
  action: '查看' | '—';
}

const MOCK: HistoryRow[] = [
  { time: '2026-07-14 14:32', type: '首次接入', badge: 'success', ds: 'ecommerce_db', detail: '发现 8 张表 · 67 字段 · 用户确认 4 字段', status: '完成', action: '查看' },
  { time: '2026-07-14 14:30', type: '连接测试', badge: 'normal', ds: 'ecommerce_db', detail: 'postgresql://192.168.1.100:5432 · 延迟 18ms', status: '成功', action: '—' },
  { time: '2026-07-12 10:15', type: 'Schema 修订', badge: 'warning', ds: 'test_db (已删除)', detail: '用户修正 2 个字段含义', status: '完成', action: '查看' },
  { time: '2026-07-10 09:48', type: '首次接入', badge: 'success', ds: 'test_db (已删除)', detail: '发现 3 张表 · 18 字段', status: '完成', action: '查看' },
];

function TypeBadge({ type, badge }: { type: string; badge: 'success' | 'warning' | 'normal' }) {
  if (badge === 'success') return <span className="badge badge-success">{type}</span>;
  if (badge === 'warning') return <span className="badge badge-warning">{type}</span>;
  return <span className="chip">{type}</span>;
}

export default function HistoryPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">探索历史</h1>
          <p className="page-subtitle">所有数据源接入与 Schema 修订记录</p>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>时间</th>
              <th>事件</th>
              <th>数据源</th>
              <th>详情</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {MOCK.map((r, i) => (
              <tr key={i}>
                <td className="num" style={{ fontSize: 12 }}>{r.time}</td>
                <td><TypeBadge type={r.type} badge={r.badge} /></td>
                <td>{r.ds}</td>
                <td>{r.detail}</td>
                <td><span className="status-dot">{r.status}</span></td>
                <td>{r.action === '查看' ? <button className="btn btn-ghost btn-sm">查看</button> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
