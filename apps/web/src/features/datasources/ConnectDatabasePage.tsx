/**
 * [Fix-7 Task 7.5] 连接数据库页 — 1:1 还原原型 PAGES['datasource-new'] (pages.js L145-234)
 *
 * Mock 表单,点击「开始探索」跳 /explore/:dsId
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const DB_TYPES = [
  { key: 'postgres', icon: '🐘', name: 'PostgreSQL' },
  { key: 'mysql', icon: '🐬', name: 'MySQL' },
  { key: 'sqlite', icon: '📦', name: 'SQLite' },
  { key: 'sqlserver', icon: '🪣', name: 'SQL Server' },
];

export default function ConnectDatabasePage() {
  const navigate = useNavigate();
  const [dbType, setDbType] = useState('postgres');
  const [form, setForm] = useState({
    host: '192.168.1.100',
    port: '5432',
    database: 'ecommerce_db',
    schema: 'public',
    user: 'readonly_user',
    password: 'demo-password',
    name: '电商订单库',
  });
  const [testing, setTesting] = useState(false);

  const update = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">连接数据库</h1>
          <p className="page-subtitle">Agent 会自主探索 Schema · 不确定的地方会向你提问</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/datasources/csv')}>
            改用 CSV 上传
          </button>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 720, margin: '0 auto' }}>
        <div className="card-body" style={{ padding: 32 }}>
          <div style={{ marginBottom: 20 }}>
            <label className="input-label">选择数据库类型</label>
            <div className="db-type-grid">
              {DB_TYPES.map((t) => (
                <div
                  key={t.key}
                  className={`db-type-card${dbType === t.key ? ' active' : ''}`}
                  onClick={() => setDbType(t.key)}
                >
                  <div className="db-type-icon">{t.icon}</div>
                  <div className="db-type-name">{t.name}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="form-row">
            <div>
              <label className="input-label">主机地址</label>
              <input className="input input-lg" value={form.host} onChange={(e) => update('host', e.target.value)} />
            </div>
            <div>
              <label className="input-label">端口</label>
              <input className="input input-lg" value={form.port} onChange={(e) => update('port', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div>
              <label className="input-label">数据库名</label>
              <input className="input input-lg" value={form.database} onChange={(e) => update('database', e.target.value)} />
            </div>
            <div>
              <label className="input-label">Schema(可选)</label>
              <input className="input input-lg" value={form.schema} onChange={(e) => update('schema', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div>
              <label className="input-label">用户名</label>
              <input className="input input-lg" value={form.user} onChange={(e) => update('user', e.target.value)} />
            </div>
            <div>
              <label className="input-label">密码</label>
              <input className="input input-lg" type="password" value={form.password} onChange={(e) => update('password', e.target.value)} />
            </div>
          </div>

          <div style={{ marginTop: 8 }}>
            <label className="input-label">数据源名称(用于展示)</label>
            <input className="input input-lg" value={form.name} onChange={(e) => update('name', e.target.value)} />
          </div>

          <div style={{ marginTop: 20, padding: '14px 16px', background: 'var(--green-lighter)', borderRadius: 8, borderLeft: '3px solid var(--green)', fontSize: 12, color: 'var(--green-darker)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            <div>
              <strong>只读模式</strong>:Agent 只会执行 SELECT 查询,不会修改您的任何数据。所有 SQL 会经过权限校验,敏感字段会被自动识别并脱敏。
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
            <button
              className="btn btn-secondary btn-lg"
              style={{ flex: 1 }}
              onClick={() => setTesting(true)}
              disabled={testing}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 0 1-9 9c-2.39 0-4.68-.94-6.4-2.6L3 16M3 12a9 9 0 0 1 9-9c2.39 0 4.68.94 6.4 2.6L21 8" /></svg>
              {testing ? '测试中...' : '测试连接'}
            </button>
            <button
              className="btn btn-primary btn-lg"
              style={{ flex: 1 }}
              onClick={() => navigate(`/explore/${form.database || 'new'}`)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              开始探索
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
