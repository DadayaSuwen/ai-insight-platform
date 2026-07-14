import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Check, Database, Link2, ShieldAlert, ArrowRight, RefreshCw } from 'lucide-react';
import { finalizeReview } from './api';

/**
 * [Sprint 6] Schema 敲定页 — 对照 prototype 的样式
 */
export default function ConfirmPage() {
  const { datasourceId } = useParams<{ datasourceId: string }>();
  const navigate = useNavigate();
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFinalize = async () => {
    if (!datasourceId) return;
    setFinalizing(true);
    setError(null);
    try {
      await finalizeReview(datasourceId);
      navigate(`/dashboard/${datasourceId}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Schema 敲定 · 准备生成工作台</h1>
          <p className="page-subtitle">所有疑问已澄清 · Agent 已完整理解你的数据库结构</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/schema-review/${datasourceId}`)}>
            <RefreshCw size={14} /> 返回修改
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleFinalize} disabled={finalizing}>
            <Check size={14} /> 确认，生成工作台
          </button>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        <StatCard icon={<Database size={16} />} label="业务表" value="—" sub="含字典表" />
        <StatCard icon={<Database size={16} />} label="字段总数" value="—" sub="已全部确认" />
        <StatCard icon={<Link2 size={16} />} label="识别关系" value="—" sub="外键 + 推断" />
        <StatCard icon={<ShieldAlert size={16} />} label="敏感字段" value="—" sub="已标记脱敏" warning />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">Agent 识别的表关系（ER 简图）</div>
          <span className="chip green">7 条关系</span>
        </div>
        <div className="card-body" style={{ padding: 24 }}>
          {/* ER 关系图 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, alignItems: 'center' }}>
            <TableCard name="customers" icon="👥" rows="3,248" core />
            <RelationArrow label="1 : N" field="cust_id" />
            <TableCard name="orders" icon="📦" rows="48,237" core />
            <RelationArrow label="1 : N" field="order_id" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, alignItems: 'center', marginTop: 16 }}>
            <div /><div />
            <TableCard name="order_items" icon="📋" rows="98,432" />
            <RelationArrow label="N : 1" field="product_id" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, alignItems: 'center', marginTop: 16 }}>
            <div /><div /><div />
            <TableCard name="products" icon="🛍️" rows="486" />
          </div>

          <div
            style={{
              marginTop: 20,
              padding: '12px 16px',
              background: 'var(--info-light)',
              borderRadius: 8,
              fontSize: 12,
              color: 'var(--info)',
            }}
          >
            <strong>Agent 判断：</strong>核心业务链路为 <code style={{ background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: 3 }}>customers → orders → order_items → products</code>，工作台将围绕这条链路设计 KPI 与图表。
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">字段语义汇总（关键表）</div>
          <button className="btn btn-ghost btn-sm">导出 JSON</button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>表</th><th>字段</th><th>类型</th><th>Agent 理解</th><th>角色</th><th>用户确认</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td rowSpan={3} style={{ verticalAlign: 'top', fontWeight: 600 }}>orders</td>
              <td className="num" style={{ fontFamily: 'monospace' }}>id</td>
              <td>bigint</td>
              <td>订单唯一标识</td>
              <td><span className="chip">主键</span></td>
              <td><span className="status-dot">已知</span></td>
            </tr>
            <tr>
              <td className="num" style={{ fontFamily: 'monospace' }}>cust_id</td>
              <td>bigint</td>
              <td>客户 ID</td>
              <td><span className="chip green">外键</span></td>
              <td><span className="status-dot">已知</span></td>
            </tr>
            <tr>
              <td className="num" style={{ fontFamily: 'monospace' }}>total_amt</td>
              <td>decimal</td>
              <td>订单总金额（元）</td>
              <td><span className="chip amber">指标</span></td>
              <td><span className="status-dot">已知</span></td>
            </tr>
          </tbody>
        </table>
        <div className="card-footer">
          Schema 理解已生成完整 JSON · 工作台将基于此数据自动生成 KPI、图表与洞察
        </div>
      </div>

      <div
        style={{
          marginTop: 24,
          padding: '16px 20px',
          background: 'var(--green-lighter)',
          borderLeft: '3px solid var(--green)',
          borderRadius: 8,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green-darker)', marginBottom: 6 }}>✓ 准备就绪</div>
        <div style={{ fontSize: 12, lineHeight: 1.7 }}>
          Agent 已完整理解您的数据库结构。点击「确认，生成工作台」后，Agent 会基于敲定的 Schema 自主生成工作台与洞察。
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 16, background: 'var(--error-light)', color: 'var(--error)', padding: 12, borderRadius: 8, fontSize: 12 }}>
          {error}
        </div>
      )}
    </>
  );
}

function StatCard({ icon, label, value, sub, warning }: { icon: React.ReactNode; label: string; value: string; sub: string; warning?: boolean }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{icon} {label}</div>
      <div className="num" style={{ fontSize: 22, fontWeight: 700, color: warning ? 'var(--warning)' : 'var(--text-primary)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function TableCard({ name, icon, rows, core }: { name: string; icon: string; rows: string; core?: boolean }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: 16,
        background: core ? 'var(--green-lighter)' : 'var(--bg-secondary)',
        borderRadius: 10,
        border: core ? '1px solid var(--green-light)' : '1px solid var(--border)',
      }}
    >
      <div style={{ fontSize: 24, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{name}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{rows} 行</div>
      {core && <div style={{ fontSize: 11, color: 'var(--green-dark)', marginTop: 4 }}>核心实体</div>}
    </div>
  );
}

function RelationArrow({ label, field }: { label: string; field: string }) {
  return (
    <div style={{ textAlign: 'center', color: 'var(--green-dark)' }}>
      <svg width="60" height="20" viewBox="0 0 60 20" style={{ margin: '0 auto' }}>
        <line x1="0" y1="10" x2="50" y2="10" stroke="currentColor" strokeWidth="1.5" />
        <polygon points="50,5 60,10 50,15" fill="currentColor" />
      </svg>
      <div style={{ fontSize: 10, marginTop: 4, fontFamily: 'monospace' }}>{label}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{field}</div>
    </div>
  );
}
