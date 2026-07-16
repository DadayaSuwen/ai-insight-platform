/**
 * [Fix-7 Task 7.5 + Fix-8 Task 8.3] 连接数据库页
 *
 * 「测试连接」→ testDatabaseConnection API
 * 「开始探索」→ registerDatabaseConnection API → 跳 /explore/:id
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { testDatabaseConnection, registerDatabaseConnection } from './api';
import type { DatabaseConnectionPayload } from './api';
import { useDatasourceStore } from '../../core/store/datasource-store';
import { toast } from '../../store/toast';

const DB_TYPES = [
  { key: 'postgres', icon: '🐘', name: 'PostgreSQL' },
  { key: 'mysql', icon: '🐬', name: 'MySQL' },
  // SQLite / SQL Server 暂不支持, coming soon
];

export default function ConnectDatabasePage() {
  const navigate = useNavigate();
  const [dbType, setDbType] = useState('postgres');
  const [form, setForm] = useState({
    host: '',
    port: '5432',
    database: '',
    schema: 'public',
    user: '',
    password: '',
    name: '',
  });
  const [testing, setTesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const update = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const buildConfig = (): DatabaseConnectionPayload => ({
    type: dbType as 'postgres' | 'mysql',
    host: form.host,
    port: parseInt(form.port) || 5432,
    database: form.database,
    user: form.user,
    password: form.password,
    schema: form.schema,
  });

  // [Fix-8 Task 8.3] 真实测试连接
  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await testDatabaseConnection(buildConfig());
      if (result.ok) {
        toast.success(`连接成功 · 延迟 ${result.latencyMs}ms`);
      } else {
        toast.error(`连接失败: ${result.error || '未知错误'}`);
      }
    } catch (err) {
      toast.error(`测试失败: ${(err as Error).message}`);
    } finally {
      setTesting(false);
    }
  };

  // [Fix-8 Task 8.3] 真实注册数据源 + 跳探索
  const handleStartExplore = async () => {
    setSubmitting(true);
    try {
      const ds = await registerDatabaseConnection({
        id: crypto.randomUUID(),
        name: form.name,
        description: `${dbType} ${form.host}:${form.port}/${form.database}`,
        config: buildConfig(),
      });

      useDatasourceStore.getState().setCurrent(ds.id, ds.name);
      toast.success(`数据源「${ds.name}」已创建，开始探索...`);
      navigate(`/explore/${ds.id}`);
    } catch (err) {
      toast.error(`创建数据源失败: ${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

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

      <div className="card max-w-[720px] mx-auto">
        <div className="card-body p-8">
          <div className="mb-5">
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

          <div className="mt-2">
            <label className="input-label">数据源名称(用于展示)</label>
            <input className="input input-lg" value={form.name} onChange={(e) => update('name', e.target.value)} />
          </div>

          <div className="mt-5 px-4 py-3.5 rounded-lg text-xs flex gap-2.5 items-start" style={{ background: 'var(--green-lighter)', borderLeft: '3px solid var(--green)', color: 'var(--green-darker)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            <div>
              <strong>只读模式</strong>:Agent 只会执行 SELECT 查询,不会修改您的任何数据。所有 SQL 会经过权限校验,敏感字段会被自动识别并脱敏。
            </div>
          </div>

          <div className="flex gap-2.5 mt-6">
            <button className="btn btn-secondary btn-lg flex-1" onClick={handleTest} disabled={testing}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 0 1-9 9c-2.39 0-4.68-.94-6.4-2.6L3 16M3 12a9 9 0 0 1 9-9c2.39 0 4.68.94 6.4 2.6L21 8" /></svg>
              {testing ? '测试中...' : '测试连接'}
            </button>
            <button className="btn btn-primary btn-lg flex-1" onClick={handleStartExplore} disabled={submitting}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              {submitting ? '创建中...' : '开始探索'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
