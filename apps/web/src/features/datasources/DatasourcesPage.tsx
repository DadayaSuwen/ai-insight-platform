/**
 * [Fix-7 Task 7.4] 数据源列表页 — 1:1 还原原型 PAGES['datasource-list'] (pages.js L64-138)
 *
 * Mock 数据 — 不调后端 API
 */
import { useNavigate } from 'react-router-dom';

interface DatasourceRow {
  id: string;
  name: string;
  type: string;
  host: string;
  tables: number;
  status: string;
  lastExplore: string;
}

const MOCK_DATASOURCES: DatasourceRow[] = [
  {
    id: 'ds_001',
    name: 'ecommerce_db',
    type: 'postgres',
    host: '192.168.1.100:5432',
    tables: 8,
    status: 'online',
    lastExplore: '2026-07-14 14:32',
  },
];

export default function DatasourcesPage() {
  const navigate = useNavigate();
  const list = MOCK_DATASOURCES;
  const dbCount = list.filter((d) => d.type !== 'csv').length;
  const csvCount = list.filter((d) => d.type === 'csv').length;
  const totalTables = list.reduce((s, d) => s + d.tables, 0);
  const configured = list.length > 0;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">数据源管理</h1>
          <p className="page-subtitle">管理所有已连接的数据源 · 支持数据库与 CSV 文件</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/datasources/csv')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            上传 CSV
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/datasources/new')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            连接数据库
          </button>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>数据源总数</div>
          <div className="num" style={{ fontSize: 22, fontWeight: 700 }}>{list.length}<span style={{ fontSize: 13, color: 'var(--text-muted)' }}> 个</span></div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>数据库</div>
          <div className="num" style={{ fontSize: 22, fontWeight: 700 }}>{dbCount}<span style={{ fontSize: 13, color: 'var(--text-muted)' }}> 个</span></div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>CSV 文件</div>
          <div className="num" style={{ fontSize: 22, fontWeight: 700 }}>{csvCount}<span style={{ fontSize: 13, color: 'var(--text-muted)' }}> 个</span></div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>表总数</div>
          <div className="num" style={{ fontSize: 22, fontWeight: 700 }}>{totalTables}<span style={{ fontSize: 13, color: 'var(--text-muted)' }}> 张</span></div>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr><th>数据源名称</th><th>类型</th><th>连接信息</th><th>表数</th><th>状态</th><th>最近探索</th><th>操作</th></tr>
          </thead>
          <tbody>
            {configured ? (
              list.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--green-lighter)', color: 'var(--green-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>
                      </div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{d.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.type === 'csv' ? 'CSV 文件' : '数据库连接'}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className="chip">{d.type}</span></td>
                  <td className="num" style={{ fontSize: 12 }}>{d.type === 'csv' ? '本地文件' : d.host}</td>
                  <td className="num">{d.tables}</td>
                  <td><span className="status-dot">在线</span></td>
                  <td className="num" style={{ fontSize: 12 }}>{d.lastExplore}</td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/dashboard/${d.id}`)}>查看</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/schema/${d.id}`)}>修订</button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                  <div style={{ fontSize: 14, marginBottom: 4 }}>还没有配置数据源</div>
                  <div style={{ fontSize: 12, marginBottom: 16 }}>连接数据库或上传 CSV 开始使用</div>
                  <button className="btn btn-primary btn-sm" onClick={() => navigate('/datasources/new')}>连接第一个数据源</button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
