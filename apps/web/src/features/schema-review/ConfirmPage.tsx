/**
 * [Fix-7 Task 7.9] Schema 敲定页 — 1:1 还原原型 PAGES.confirm (pages.js L634+)
 *
 * Mock: 内嵌 8 张表 + 67 字段 + 7 关系; 不调 API
 */
import { useParams, useNavigate } from 'react-router-dom';
import { Check, Database, Link2, ShieldAlert, ArrowRight, RefreshCw, Download } from 'lucide-react';

const TABLES_ER = [
  { name: 'customers', icon: '👥', rows: 3248, core: true },
  { name: 'orders', icon: '📋', rows: 48237 },
  { name: 'order_items', icon: '📦', rows: 98432 },
  { name: 'products', icon: '🛍️', rows: 486 },
];

const FIELD_SUMMARY = [
  { table: 'orders', field: 'id', type: 'bigint', meaning: '订单唯一标识 (PK)', role: 'identifier', confirmed: true },
  { table: 'orders', field: 'cust_id', type: 'bigint', meaning: '客户 ID (FK)', role: 'identifier', confirmed: true },
  { table: 'orders', field: 'total_amt', type: 'decimal', meaning: '订单总金额（元）', role: 'measure', confirmed: true },
  { table: 'orders', field: 'status', type: 'varchar', meaning: '状态枚举 · pending/paid/shipped/delivered/cancelled/refunded', role: 'dimension', confirmed: true },
  { table: 'orders', field: 'coupon_code', type: 'varchar', meaning: '优惠券代码 · 已脱敏', role: 'dimension', confirmed: true },
  { table: 'orders', field: 'created_at', type: 'timestamp', meaning: '下单时间', role: 'time', confirmed: true },
  { table: 'customers', field: 'id', type: 'bigint', meaning: '客户唯一标识 (PK)', role: 'identifier', confirmed: true },
  { table: 'customers', field: 'name', type: 'varchar', meaning: '客户姓名', role: 'dimension', confirmed: true },
  { table: 'customers', field: 'email', type: 'varchar', meaning: '邮箱 · 已脱敏', role: 'dimension', confirmed: true },
  { table: 'customers', field: 'created_at', type: 'timestamp', meaning: '注册时间', role: 'time', confirmed: true },
  { table: 'products', field: 'id', type: 'bigint', meaning: '商品唯一标识 (PK)', role: 'identifier', confirmed: true },
  { table: 'products', field: 'name', type: 'varchar', meaning: '商品名称', role: 'dimension', confirmed: true },
  { table: 'products', field: 'price', type: 'decimal', meaning: '单价（元）', role: 'measure', confirmed: true },
  { table: 'products', field: 'stock', type: 'int', meaning: '库存数量', role: 'measure', confirmed: true },
  { table: 'order_items', field: 'id', type: 'bigint', meaning: '订单明细 ID (PK)', role: 'identifier', confirmed: true },
  { table: 'order_items', field: 'order_id', type: 'bigint', meaning: '订单 ID (FK)', role: 'identifier', confirmed: true },
];

function roleChip(role: string): string {
  if (role === 'measure') return 'amber';
  if (role === 'time') return 'green';
  if (role === 'dimension') return 'green';
  return '';
}

export default function ConfirmPage() {
  const { datasourceId } = useParams<{ datasourceId: string }>();
  const navigate = useNavigate();

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Schema 敲定 · 准备生成工作台</h1>
          <p className="page-subtitle">所有疑问已澄清 · 8 张表 · 67 字段 · 7 条表关系</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/schema-review/${datasourceId ?? 'mock'}`)}>
            <RefreshCw size={14} /> 返回修改
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate(`/dashboard/${datasourceId ?? 'ds_001'}`)}>
            <Check size={14} /> 确认，生成工作台
          </button>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        <StatCard icon={<Database size={16} />} label="业务表" value="8" sub="含 1 张字典表" />
        <StatCard icon={<Database size={16} />} label="字段总数" value="67" sub="63 已确认 · 4 用户标注" accent />
        <StatCard icon={<Link2 size={16} />} label="识别关系" value="7" sub="5 外键 + 2 推断" />
        <StatCard icon={<ShieldAlert size={16} />} label="敏感字段" value="2" sub="已标记脱敏规则" warning />
      </div>

      {/* ER 简图 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">Agent 识别的表关系(ER 简图)</div>
          <span className="chip green">7 条关系</span>
        </div>
        <div className="card-body" style={{ padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, alignItems: 'center' }}>
            {TABLES_ER.slice(0, 2).map((t, i) => (
              <TableCard key={t.name} name={t.name} icon={t.icon} rows={t.rows.toLocaleString()} core={i === 0} />
            ))}
            <div style={{ textAlign: 'center', color: 'var(--green-dark)' }}>
              <svg width="60" height="20" viewBox="0 0 60 20" style={{ margin: '0 auto' }}>
                <line x1="0" y1="10" x2="50" y2="10" stroke="currentColor" strokeWidth="1.5" />
                <polygon points="50,5 60,10 50,15" fill="currentColor" />
              </svg>
              <div style={{ fontSize: 10, marginTop: 4, fontFamily: 'monospace' }}>FK</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>cust_id</div>
            </div>
            {TABLES_ER[2] && (
              <TableCard key={TABLES_ER[2].name} name={TABLES_ER[2].name} icon={TABLES_ER[2].icon} rows={TABLES_ER[2].rows.toLocaleString()} />
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, alignItems: 'center', marginTop: 16 }}>
            {TABLES_ER.slice(0, 2).map((t, i) => (
              <TableCard key={t.name + '-2'} name={t.name} icon={t.icon} rows={t.rows.toLocaleString()} ghost />
            ))}
            <div style={{ textAlign: 'center', color: 'var(--green-dark)' }}>
              <svg width="60" height="20" viewBox="0 0 60 20" style={{ margin: '0 auto' }}>
                <line x1="0" y1="10" x2="50" y2="10" stroke="currentColor" strokeWidth="1.5" />
                <polygon points="50,5 60,10 50,15" fill="currentColor" />
              </svg>
              <div style={{ fontSize: 10, marginTop: 4, fontFamily: 'monospace' }}>FK</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>prod_id</div>
            </div>
            {TABLES_ER[3] && (
              <TableCard key={TABLES_ER[3].name} name={TABLES_ER[3].name} icon={TABLES_ER[3].icon} rows={TABLES_ER[3].rows.toLocaleString()} />
            )}
          </div>

          <div style={{ marginTop: 20, padding: '12px 16px', background: 'var(--info-light)', borderRadius: 8, fontSize: 12, color: 'var(--info)' }}>
            <strong>Agent 判断:</strong>核心业务链路为{' '}
            <code style={{ background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: 3, margin: '0 4px' }}>
              customers → orders → order_items
            </code>
            ,工作台将围绕这条链路设计 KPI 与图表。
          </div>
        </div>
      </div>

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
              <th>用户确认</th>
            </tr>
          </thead>
          <tbody>
            {FIELD_SUMMARY.map((f) => (
              <tr key={`${f.table}.${f.field}`}>
                <td style={{ verticalAlign: 'top', fontWeight: 600 }}>{f.table}</td>
                <td className="num" style={{ fontFamily: 'monospace' }}>{f.field}</td>
                <td>{f.type}</td>
                <td>{f.meaning}</td>
                <td>
                  <span className={`chip ${roleChip(f.role)}`}>{f.role}</span>
                </td>
                <td>
                  {f.confirmed ? (
                    <span className="status-dot">已知</span>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>未确认</span>
                  )}
                </td>
              </tr>
            ))}
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
          Agent 已完整理解您的数据库结构。点击「确认,生成工作台」后, Agent 会基于敲定的 Schema 自主生成工作台与洞察。
          <ArrowRight size={12} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 4 }} />
        </div>
      </div>
    </>
  );
}

function StatCard({ icon, label, value, sub, accent, warning }: { icon: React.ReactNode; label: string; value: string; sub: string; accent?: boolean; warning?: boolean }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{icon} {label}</div>
      <div className="num" style={{ fontSize: 22, fontWeight: 700, color: warning ? 'var(--warning)' : 'var(--text-primary)' }}>{value}{accent && <span style={{ fontSize: 13, color: 'var(--green-dark)' }}> 个</span>}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function TableCard({ name, icon, rows, core, ghost }: { name: string; icon: string; rows: string; core?: boolean; ghost?: boolean }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: 16,
        background: core ? 'var(--green-lighter)' : ghost ? 'var(--bg-primary)' : 'var(--bg-secondary)',
        borderRadius: 10,
        border: core ? '1px solid var(--green-light)' : '1px solid var(--border)',
        opacity: ghost ? 0.6 : 1,
      }}
    >
      <div style={{ fontSize: 24, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{name}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{rows} 行</div>
      {core && <div style={{ fontSize: 11, color: 'var(--green-dark)', marginTop: 4 }}>核心实体</div>}
    </div>
  );
}
