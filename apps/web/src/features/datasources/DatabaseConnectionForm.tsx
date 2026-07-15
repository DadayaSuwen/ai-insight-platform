import { useState } from 'react';
import {
  testDatabaseConnection,
  registerDatabaseConnection,
  type DatabaseConnectionPayload,
} from './api';
import { toast } from '../../store/toast';

/**
 * [Sprint 4 / V3] 数据库连接表单
 *
 * - 类型:PostgreSQL / MySQL
 * - 字段:Name / Host / Port / Database / User / Password (optional, type=password)
 *         + SSL (仅 PG) + Schema (仅 PG)
 * - Test Connection → POST /api/datasources/test
 * - 成功后 register → POST /api/datasources(密码走加密存储)
 *
 * 架构师避坑:
 *   - 密码 type="password" 防肩窥
 *   - 测试连接失败时仍允许保存(用户可能本地未启动 DB, 想先存配置)
 *   - submit 后立即 reload 列表让 DataSourcesTab 看到新行
 */

type DbType = 'postgres' | 'mysql';

const DEFAULT_PORT: Record<DbType, number> = {
  postgres: 5432,
  mysql: 3306,
};

interface FormState {
  type: DbType;
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  schema: string;
}

const INITIAL_FORM: FormState = {
  type: 'postgres',
  id: '',
  name: '',
  host: 'localhost',
  port: 5432,
  database: '',
  user: '',
  password: '',
  ssl: false,
  schema: 'public',
};

export default function DatabaseConnectionForm(props: {
  onRegistered: (id: string) => void;
}) {
  const { onRegistered } = props;
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; latencyMs?: number; error?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm(prev => ({ ...prev, [k]: v }));
  };

  const handleTypeChange = (type: DbType) => {
    setForm(prev => ({
      ...prev,
      type,
      port: DEFAULT_PORT[type],
    }));
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const cfg: DatabaseConnectionPayload = {
        type: form.type,
        host: form.host,
        port: form.port,
        database: form.database,
        user: form.user,
        password: form.password || undefined,
        ssl: form.type === 'postgres' ? form.ssl : undefined,
        schema: form.type === 'postgres' ? form.schema : undefined,
      };
      const result = await testDatabaseConnection(cfg);
      setTestResult({ ok: true, latencyMs: result.latencyMs });
      toast.success(`连接成功 (${result.latencyMs}ms)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResult({ ok: false, error: msg });
      toast.error(`连接失败：${msg}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.id.trim() || !form.name.trim() || !form.database.trim()) {
      toast.error('请填写 ID / 名称 / 数据库名');
      return;
    }
    setSubmitting(true);
    try {
      const cfg: DatabaseConnectionPayload = {
        type: form.type,
        host: form.host,
        port: form.port,
        database: form.database,
        user: form.user,
        password: form.password || undefined,
        ssl: form.type === 'postgres' ? form.ssl : undefined,
        schema: form.type === 'postgres' ? form.schema : undefined,
      };
      const created = await registerDatabaseConnection({
        id: form.id.trim(),
        name: form.name.trim(),
        config: cfg,
      });
      toast.success(`已注册：${created.name}`);
      onRegistered(created.id);
      // 重置表单
      setForm({ ...INITIAL_FORM });
      setTestResult(null);
    } catch (err) {
      toast.error(`注册失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-default p-3 bg-muted">
      <p className="mb-3 text-xs font-medium text-secondary">
        数据库连接
      </p>

      {/* 类型选择 */}
      <div className="mb-3 flex gap-2">
        {(['postgres', 'mysql'] as DbType[]).map(t => (
          <button
            key={t}
            onClick={() => handleTypeChange(t)}
            className="rounded-md px-3 py-1.5 text-xs border border-default"
            style={{
              background: form.type === t ? 'var(--accent)' : 'transparent',
              color: form.type === t ? 'white' : 'var(--text-secondary)',
            }}
          >
            {t === 'postgres' ? 'PostgreSQL' : 'MySQL'}
          </button>
        ))}
      </div>

      {/* 字段 */}
      <div className="grid grid-cols-2 gap-2">
        <Field label="数据源 ID" placeholder="如:analytics-prod">
          <input
            type="text"
            value={form.id}
            onChange={e => setField('id', e.target.value)}
            className="input"
            placeholder="analytics-prod"
          />
        </Field>
        <Field label="显示名" placeholder="如:生产分析库">
          <input
            type="text"
            value={form.name}
            onChange={e => setField('name', e.target.value)}
            className="input"
            placeholder="生产分析库"
          />
        </Field>
        <Field label="Host" placeholder="localhost">
          <input
            type="text"
            value={form.host}
            onChange={e => setField('host', e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Port">
          <input
            type="number"
            value={form.port}
            onChange={e => setField('port', Number(e.target.value))}
            className="input"
          />
        </Field>
        <Field label="Database">
          <input
            type="text"
            value={form.database}
            onChange={e => setField('database', e.target.value)}
            className="input"
            placeholder="analytics"
          />
        </Field>
        <Field label="User">
          <input
            type="text"
            value={form.user}
            onChange={e => setField('user', e.target.value)}
            className="input"
            placeholder="ai_insight_ro"
          />
        </Field>
        <Field label="Password" full>
          <input
            type="password"
            value={form.password}
            onChange={e => setField('password', e.target.value)}
            className="input"
            placeholder="(可选)"
            autoComplete="new-password"
          />
        </Field>
        {form.type === 'postgres' && (
          <>
            <Field label="Schema">
              <input
                type="text"
                value={form.schema}
                onChange={e => setField('schema', e.target.value)}
                className="input"
                placeholder="public"
              />
            </Field>
            <Field label="SSL">
              <label className="flex items-center gap-2 pt-1.5">
                <input
                  type="checkbox"
                  checked={form.ssl}
                  onChange={e => setField('ssl', e.target.checked)}
                />
                <span className="text-xs text-secondary">
                  启用 TLS
                </span>
              </label>
            </Field>
          </>
        )}
      </div>

      {/* 测试结果 */}
      {testResult && (
        <div
          className="mt-3 rounded p-2 text-[10px]"
          style={{
            background: testResult.ok ? 'var(--success-light, #e6f4ea)' : 'var(--error-light, #fbe9e7)',
            color: testResult.ok ? 'var(--success)' : 'var(--error)',
          }}
        >
          {testResult.ok
            ? `✓ 连接成功 (${testResult.latencyMs}ms)`
            : `✗ ${testResult.error}`}
        </div>
      )}

      {/* 按钮 */}
      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={handleTest}
          disabled={testing || !form.host || !form.database || !form.user}
          className="rounded-md px-3 py-1.5 text-xs disabled:opacity-50 bg-transparent text-secondary border border-default"
        >
          {testing ? '测试中...' : '测试连接'}
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting || !form.id || !form.name}
          className="rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50 bg-accent text-white"
        >
          {submitting ? '注册中...' : '注册数据源'}
        </button>
      </div>

      <style>
        {`
        .input {
          width: 100%;
          background: var(--bg-primary);
          border: 1px solid var(--border);
          color: var(--text-primary);
          border-radius: 0.375rem;
          padding: 0.375rem 0.5rem;
          font-size: 0.75rem;
        }
        .input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
        `}
      </style>
    </div>
  );
}

function Field(props: {
  label: string;
  placeholder?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={props.full ? 'col-span-2' : ''}>
      <label className="mb-1 block text-[10px] font-medium text-muted">
        {props.label}
      </label>
      {props.children}
    </div>
  );
}