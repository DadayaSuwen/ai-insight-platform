/**
 * [Fix-11 Task 11.5] 数据源列表页 — 接入真实 API
 *
 * 删除 Fix-7 mock (MOCK_DATASOURCES 数组)
 * 改用 listDataSources
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listDataSources, type DataSourceListItem } from './api';
import { toast } from '../../store/toast';

export default function DatasourcesPage() {
  const navigate = useNavigate();
  const [list, setList] = useState<DataSourceListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadList = () => {
    setLoading(true);
    listDataSources()
      .then((data) => {
        setList(data);
        setLoading(false);
      })
      .catch((err) => {
        toast.error(`加载失败: ${(err as Error).message}`);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadList();
  }, []);

  const dbCount = list.filter((d) => d.type === 'postgres' || d.type === 'mysql').length;
  const csvCount = list.filter((d) => d.type === 'duckdb-csv').length;

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
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>状态</div>
          <div className="num" style={{ fontSize: 22, fontWeight: 700 }}>{list.length > 0 ? '在线' : '—'}</div>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>加载数据源列表...</div>
        ) : list.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
            <div style={{ fontSize: 14, marginBottom: 4 }}>还没有配置数据源</div>
            <div style={{ fontSize: 12, marginBottom: 16 }}>连接数据库或上传 CSV 开始使用</div>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/datasources/new')}>连接第一个数据源</button>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>数据源名称</th>
                <th>类型</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((ds) => (
                <tr key={ds.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--green-lighter)', color: 'var(--green-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {ds.type === 'duckdb-csv' ? '📄' : '🐘'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{ds.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ds.description || ds.type}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className="chip">{ds.type}</span></td>
                  <td>
                    <span className={`status-dot${ds.status !== 'active' ? ' muted' : ''}`}>
                      {ds.status === 'active' ? '在线' : ds.status}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>{new Date(ds.createdAt).toLocaleDateString('zh-CN')}</td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/dashboard/${ds.id}`)}>查看</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/schema/${ds.id}`)}>修订</button>
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
