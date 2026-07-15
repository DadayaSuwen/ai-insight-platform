/**
 * Schema 修订页 — 手动编辑每个字段的中文名/角色/描述
 *
 * 从 API 加载当前 schema，逐字段可编辑，保存后写入 DataSource.columnAliases。
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDatasourceSchema, saveColumns, type SchemaUnderstanding } from './api';
import { toast } from '../../store/toast';

interface ColEdit {
  table: string;
  name: string;
  rawType: string;
  chineseName: string;
  role: string;
  description: string;
  sampleValues?: string[];
  dirty: boolean;
}

const ROLE_OPTIONS = [
  { value: 'dimension', label: '维度' },
  { value: 'measure', label: '度量' },
  { value: 'time', label: '时间' },
  { value: 'identifier', label: '标识符' },
];

export default function SchemaRevisePage() {
  const { datasourceId } = useParams<{ datasourceId: string }>();
  const navigate = useNavigate();
  const [cols, setCols] = useState<ColEdit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!datasourceId) return;
    setLoading(true);
    getDatasourceSchema(datasourceId)
      .then(({ schemaUnderstanding }) => {
        if (!schemaUnderstanding?.tables) {
          setCols([]);
          return;
        }
        const edits: ColEdit[] = [];
        for (const t of schemaUnderstanding.tables) {
          for (const c of t.columns) {
            edits.push({
              table: t.name,
              name: c.name,
              rawType: c.rawType,
              chineseName: c.chineseName ?? '',
              role: c.semanticRole ?? 'dimension',
              description: c.description ?? '',
              dirty: false,
            });
          }
        }
        setCols(edits);
        // 默认展开所有表
        const exp: Record<string, boolean> = {};
        for (const t of schemaUnderstanding.tables) exp[t.name] = true;
        setExpanded(exp);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [datasourceId]);

  const updateCol = (idx: number, field: keyof ColEdit, value: string) => {
    setCols((prev) => prev.map((c, i) => (i === idx ? { ...c, [field]: value, dirty: true } : c)));
  };

  const dirtyCount = cols.filter((c) => c.dirty).length;

  const handleSave = async () => {
    if (!datasourceId) { toast.error('缺少数据源 ID'); return; }
    const dirty = cols.filter((c) => c.dirty);
    if (dirty.length === 0) { toast.info('没有需要保存的修改'); return; }
    setSaving(true);
    try {
      const payload: Record<string, { chineseName: string; role?: string; description?: string }> = {};
      for (const c of dirty) {
        payload[c.name] = {
          chineseName: c.chineseName || c.name,
          role: c.role,
          description: c.description,
        };
      }
      const result = await saveColumns(datasourceId, payload);
      // 保存成功后刷新页面让 metadata 缓存重新加载别名
      toast.success(`已保存 ${result.updated} 个字段`);
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      console.error('[SchemaRevise] save failed', err);
      toast.error(`保存失败: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  // 按表分组
  const tables = [...new Set(cols.map((c) => c.table))];
  const tableGroups = tables.map((t) => ({ name: t, cols: cols.filter((c) => c.table === t) }));

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: '40vh' }}>
        <p className="text-muted">加载 Schema...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-10 text-center">
        <p className="text-error mb-4">{error}</p>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/datasources')}>返回</button>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Schema 修订 · 手动编辑字段</h1>
          <p className="page-subtitle">
            直接修改每个字段的中文名、语义角色和描述
            {dirtyCount > 0 && <span className="text-warning ml-2">（{dirtyCount} 个未保存）</span>}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => datasourceId && navigate(`/schema-review/${datasourceId}`)}>
            💬 AI 纠错对话
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/explore/${datasourceId}`)}>
            🔄 重新探索
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={dirtyCount === 0 || saving}
          >
            {saving ? '保存中...' : `保存修改${dirtyCount > 0 ? ` (${dirtyCount})` : ''}`}
          </button>
        </div>
      </div>

      {tableGroups.map((tg) => (
        <div key={tg.name} className="card mb-4">
          <div
            className="card-header cursor-pointer select-none"
            onClick={() => setExpanded((prev) => ({ ...prev, [tg.name]: !prev[tg.name] }))}
          >
            <div className="card-title">
              {expanded[tg.name] ? '▾' : '▸'} {tg.name}
              <span className="text-xs text-muted ml-2 font-normal">
                {tg.cols.length} 个字段
              </span>
            </div>
          </div>
          {expanded[tg.name] && (
            <div className="card-body p-0 overflow-x-auto">
              <table className="table m-0">
                <thead>
                  <tr>
                    <th className="w-[160px]">物理名</th>
                    <th className="w-[90px]">类型</th>
                    <th className="w-[160px]">中文名</th>
                    <th className="w-[100px]">语义角色</th>
                    <th>描述</th>
                  </tr>
                </thead>
                <tbody>
                  {tg.cols.map((c, i) => {
                    const idx = cols.findIndex((x) => x.table === c.table && x.name === c.name);
                    return (
                      <tr key={c.name} style={c.dirty ? { background: 'var(--warning-light)' } : undefined}>
                        <td>
                          <code className="text-xs">{c.name}</code>
                        </td>
                        <td className="text-xs text-muted">{c.rawType}</td>
                        <td>
                          <input
                            className="input input-sm w-full text-xs"
                            value={c.chineseName}
                            onChange={(e) => updateCol(idx, 'chineseName', e.target.value)}
                            placeholder={c.name}
                          />
                        </td>
                        <td>
                          <select
                            className="input input-sm w-full text-xs"
                            value={c.role}
                            onChange={(e) => updateCol(idx, 'role', e.target.value)}
                          >
                            {ROLE_OPTIONS.map((r) => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            className="input input-sm w-full text-xs"
                            value={c.description}
                            onChange={(e) => updateCol(idx, 'description', e.target.value)}
                            placeholder="业务含义说明..."
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {cols.length === 0 && (
        <div className="card p-12 text-center text-muted">
          <div className="text-4xl mb-2">📭</div>
          <div className="text-sm">该数据源尚未完成 Schema 探索，请先</div>
          <button className="btn btn-primary btn-sm mt-3" onClick={() => navigate(`/explore/${datasourceId}`)}>
            开始探索
          </button>
        </div>
      )}
    </>
  );
}
