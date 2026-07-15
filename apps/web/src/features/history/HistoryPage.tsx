/**
 * [Fix-11 Task 11.4] 探索历史页 — 接入真实 API
 *
 * 删除 Fix-7 mock (MOCK 数组)
 * 用 listDataSources 构建历史记录
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listDataSources, type DataSourceListItem } from '../datasources/api';

interface HistoryRow {
  time: string;
  event: string;
  badge: 'success' | 'warning' | 'normal';
  ds: string;
  detail: string;
  dsId: string;
}

function TypeBadge({ type, badge }: { type: string; badge: 'success' | 'warning' | 'normal' }) {
  if (badge === 'success') return <span className="badge badge-success">{type}</span>;
  if (badge === 'warning') return <span className="badge badge-warning">{type}</span>;
  return <span className="chip">{type}</span>;
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listDataSources()
      .then((list: DataSourceListItem[]) => {
        const history: HistoryRow[] = list.map((ds) => ({
          time: new Date(ds.createdAt).toLocaleString('zh-CN'),
          event: '数据源接入',
          badge: 'success' as const,
          ds: ds.name,
          detail: `类型: ${ds.type} · 状态: ${ds.status}`,
          dsId: ds.id,
        }));
        setRows(history);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">探索历史</h1>
          <p className="page-subtitle">所有数据源接入与 Schema 修订记录</p>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>加载历史记录...</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
            <div style={{ fontSize: 14, marginBottom: 4 }}>暂无探索历史</div>
            <div style={{ fontSize: 12 }}>连接数据源后，探索记录会显示在这里</div>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>时间</th>
                <th>事件</th>
                <th>数据源</th>
                <th>详情</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="num" style={{ fontSize: 12 }}>{r.time}</td>
                  <td><TypeBadge type={r.event} badge={r.badge} /></td>
                  <td>{r.ds}</td>
                  <td>{r.detail}</td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/dashboard/${r.dsId}`)}>查看</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
