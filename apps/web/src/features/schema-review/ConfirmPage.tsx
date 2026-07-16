/**
 * [Fix-9 Task 9.3] Schema 敲定页 — 接入真实 API
 *
 * 删除 Fix-7 mock (TABLES_ER / FIELD_SUMMARY)
 * 改用 getDatasourceSchema + finalizeReview
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Check, Database, Link2, ShieldAlert, ArrowRight, RefreshCw, Download } from 'lucide-react';
import { finalizeReview, getDatasourceSchema } from './api';
import type { SchemaUnderstanding } from './api';
import { toast } from '../../store/toast';
import { useDatasourceStore } from '../../core/store/datasource-store';

export default function ConfirmPage() {
  const { datasourceId } = useParams<{ datasourceId: string }>();
  const navigate = useNavigate();
  const reviewId = useDatasourceStore((s) => s.currentReviewId);

  const [understanding, setUnderstanding] = useState<SchemaUnderstanding | null>(null);
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!datasourceId) return;
    setLoading(true);
    setError(null);
    getDatasourceSchema(datasourceId)
      .then((res) => {
        setUnderstanding(res.schemaUnderstanding);
        setLoading(false);
      })
      .catch((err) => {
        setError((err as Error).message);
        setLoading(false);
      });
  }, [datasourceId]);

  const handleFinalize = async () => {
    if (!datasourceId) return;
    setFinalizing(true);
    setError(null);
    try {
      if (reviewId) {
        await finalizeReview(reviewId);
        useDatasourceStore.getState().setReviewId(null);
      }
      toast.success('Schema 已敲定，正在生成工作台...');
      navigate(`/dashboard/${datasourceId}`);
    } catch (err) {
      setError((err as Error).message);
      toast.error('敲定失败');
    } finally {
      setFinalizing(false);
    }
  };

  const tables = understanding?.tables ?? [];
  const totalFields = tables.reduce((s, t) => s + t.columns.length, 0);
  const totalRelations = understanding?.relations?.length ?? 0;
  const sensitiveFields = tables.flatMap((t) => t.columns).filter((c) => c.semanticRole === 'sensitive').length;

  if (loading) {
    return (
      <div className="p-16 text-center text-muted text-sm">
        加载 Schema 理解中...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-10 text-center">
        <p className="text-error mb-4">{error}</p>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/schema-review/${datasourceId}`)}>
          返回纠错
        </button>
      </div>
    );
  }

  if (!understanding) {
    return (
      <div className="p-16 text-center">
        <p className="text-muted mb-4">未找到 Schema 理解数据</p>
        <button className="btn btn-primary btn-sm" onClick={() => navigate(`/schema-review/${datasourceId}`)}>
          返回纠错
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Schema 敲定 · 准备生成工作台</h1>
          <p className="page-subtitle">所有疑问已澄清 · {tables.length} 张表 · {totalFields} 字段 · {totalRelations} 条表关系</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/schema-review/${datasourceId}`)}>
            <RefreshCw size={14} /> 返回修改
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleFinalize} disabled={finalizing}>
            <Check size={14} /> {finalizing ? '敲定中...' : '确认，生成工作台'}
          </button>
        </div>
      </div>

      <div className="grid grid-4 mb-6">
        <StatCard icon={<Database size={16} />} label="业务表" value={`${tables.length}`} sub="已探索完成" />
        <StatCard icon={<Database size={16} />} label="字段总数" value={`${totalFields}`} sub="含维度/指标/时间" accent />
        <StatCard icon={<Link2 size={16} />} label="识别关系" value={`${totalRelations}`} sub="外键 + 推断" />
        <StatCard icon={<ShieldAlert size={16} />} label="敏感字段" value={`${sensitiveFields}`} sub="已标记脱敏规则" warning />
      </div>

      {/* 表关系 */}
      {understanding.relations && understanding.relations.length > 0 && (
        <div className="card mb-4">
          <div className="card-header">
            <div className="card-title">Agent 识别的表关系</div>
            <span className="chip green">{understanding.relations.length} 条关系</span>
          </div>
          <div className="card-body p-4">
            <div className="flex flex-col gap-2.5">
              {understanding.relations.map((rel, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-3.5 py-2.5 bg-muted rounded-lg text-sm"
                >
                  <code className="font-mono-custom text-green">{rel.from}</code>
                  <span className="text-green">→</span>
                  <code className="font-mono-custom text-warning">{rel.to}</code>
                  <span className="chip green">{(rel.confidence * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 字段语义汇总表 */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">字段语义汇总(关键表)</div>
          <button className="btn btn-ghost btn-sm">
            <Download size={12} /> 导出 JSON
          </button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>表</th>
              <th>字段</th>
              <th>类型</th>
              <th>Agent 理解</th>
              <th>角色</th>
            </tr>
          </thead>
          <tbody>
            {tables.slice(0, 6).map((table) =>
              table.columns.slice(0, 5).map((col) => (
                <tr key={`${table.name}.${col.name}`}>
                  <td className="font-semibold">{table.name}</td>
                  <td className="num font-mono-custom">{col.name}</td>
                  <td>{col.rawType}</td>
                  <td>{col.chineseName || col.name}</td>
                  <td>
                    <span className={`chip ${col.semanticRole === 'measure' ? 'amber' : 'green'}`}>
                      {col.semanticRole || 'unknown'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="card-footer">
          Schema 理解已生成完整 JSON · 工作台将基于此数据自动生成 KPI、图表与洞察
        </div>
      </div>

      <div
        className="mt-6 px-5 py-4 rounded-lg"
        style={{
          background: 'var(--green-lighter)',
          borderLeft: '3px solid var(--green)',
        }}
      >
        <div className="text-sm font-semibold mb-1.5" style={{ color: 'var(--green-darker)' }}>✓ 准备就绪</div>
        <div className="text-xs leading-relaxed">
          Agent 已完整理解您的数据库结构。点击「确认,生成工作台」后, Agent 会基于敲定的 Schema 自主生成工作台与洞察。
          <ArrowRight size={12} className="inline align-middle ml-1" />
        </div>
      </div>
    </>
  );
}

function StatCard({ icon, label, value, sub, accent, warning }: { icon: React.ReactNode; label: string; value: string; sub: string; accent?: boolean; warning?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted mb-1.5">{icon} {label}</div>
      <div className="num text-2xl font-bold" style={{ color: warning ? 'var(--warning)' : 'var(--text-primary)' }}>
        {value}
        {accent && <span className="text-sm text-green"> 个</span>}
      </div>
      <div className="text-xs text-muted mt-1">{sub}</div>
    </div>
  );
}
