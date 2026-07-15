/**
 * [Fix-7 Task 7.12] 主动洞察页 — 1:1 还原原型 PAGES.insights (pages.js L988-1080)
 *
 * Mock: 3 条硬编码洞察 + 巡检状态卡, 不调 /api/insights
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface Insight {
  id: string;
  icon: string;
  emoji: string;
  title: string;
  severity: '高' | '中' | '低';
  confidence: number;
  type: 'risk' | 'anomaly' | 'opportunity';
  desc: string;
  steps?: string[];
  advice: string;
  tables: string[];
  bg: string;
  accent: string;
}

const INSIGHTS: Insight[] = [
  {
    id: 'i1',
    icon: '🔴',
    emoji: '🔴',
    title: '客单价连续 2 月下降',
    severity: '高',
    confidence: 92,
    type: 'risk',
    desc: 'Agent 在分析 <code>orders.total_amt</code> 时序数据时发现:客单价从 2026-05 的 ¥184.2 持续下降至 2026-07 的 ¥174.5,下降 5.2%。进一步关联 <code>customers.level</code> 发现,下降主因是 <strong>L1 新客户占比从 38% 上升至 52%</strong>。',
    steps: [
      '1. 检测 total_amt 时序异常 → 发现连续下降',
      '2. 假设 1:季节性? → 对比去年同期,排除',
      '3. 假设 2:品类结构变化? → 各品类占比稳定,排除',
      '4. 假设 3:客户结构变化? → 关联 customers.level,命中!',
      '5. 验证:L1 占比上升 14pp,符合降幅',
    ],
    advice: '<strong>Agent 建议:</strong> 1) 排查 5-6 月是否有大规模拉新活动;2) 评估 L1 → L2 转化路径;3) 监控 8 月客单价是否企稳。',
    tables: ['orders', 'customers'],
    bg: 'var(--error-light)',
    accent: 'var(--error)',
  },
  {
    id: 'i2',
    icon: '⚠️',
    emoji: '⚠️',
    title: 'app 渠道取消率异常上升',
    severity: '中',
    confidence: 87,
    type: 'anomaly',
    desc: 'Agent 在分析 <code>orders</code> 表 <code>status=\'cancelled\'</code> 分布时发现:app 渠道本月取消率 6.8%,远高于历史均值 3.2%(2.3σ 异常)。其他渠道正常。',
    advice: '<strong>Agent 建议:</strong> 1) 核查 app 7.10 版本下单流程日志;2) 临时给「机械键盘 RGB」加风险提示;3) 联系取消订单客户了解原因。',
    tables: ['orders'],
    bg: 'var(--warning-light)',
    accent: 'var(--warning)',
  },
  {
    id: 'i3',
    icon: '💡',
    emoji: '💡',
    title: 'VIP 客户复购率显著提升',
    severity: '低',
    confidence: 95,
    type: 'opportunity',
    desc: 'Agent 在分析 <code>customers.level IN (4,5)</code> 客户复购行为时发现:7 月 VIP 客户复购率达 38%,较上月 32% 提升 6 个百分点。可能与 6 月底推出的「会员专享日」活动相关。',
    advice: '<strong>Agent 建议:</strong> 1) 复盘活动 ROI;2) 提取复购 VIP 偏好品类;3) 考虑下沉到 L3 做 A/B 测试。',
    tables: ['orders', 'customers'],
    bg: 'var(--green-lighter)',
    accent: 'var(--green-dark)',
  },
];

export default function InsightsPage() {
  const navigate = useNavigate();
  const [range, setRange] = useState('today');

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">主动洞察 · Agent 自主发现</h1>
          <p className="page-subtitle">Agent 每日定时巡检 · 共 {INSIGHTS.length} 条今日洞察</p>
        </div>
        <div className="page-actions">
          <select className="input" value={range} onChange={(e) => setRange(e.target.value)} style={{ width: 110 }}>
            <option value="today">今日</option>
            <option value="week">本周</option>
            <option value="month">本月</option>
          </select>
          <button className="btn btn-secondary btn-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><circle cx="19" cy="12" r="3" /><circle cx="5" cy="12" r="3" /></svg>
            配置巡检
          </button>
        </div>
      </div>

      {/* 巡检状态卡 */}
      <div className="card" style={{ marginBottom: 16, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--green-lighter)', color: 'var(--green-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>今日巡检已完成</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>14:00 触发 · 耗时 47s · 检查 12 项指标</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <span className="badge badge-error">1 风险</span>
          <span className="badge badge-warning">1 异常</span>
          <span className="badge badge-success">1 机会</span>
        </div>
      </div>

      {/* 洞察卡片列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {INSIGHTS.map((ins) => (
          <div key={ins.id} className="card">
            <div className="card-header" style={{ background: ins.bg }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>{ins.icon}</span>
                <div>
                  <div className="card-title" style={{ color: ins.accent }}>{ins.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {ins.type === 'risk' ? '风险' : ins.type === 'anomaly' ? '异常' : '机会'}
                    {' · '}严重度 {ins.severity} {' · '}置信度 {ins.confidence}%
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-ghost btn-sm">标记已处理</button>
                <button className="btn btn-ghost btn-sm">屏蔽此类</button>
              </div>
            </div>
            <div className="card-body">
              <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7, margin: '0 0 12px' }} dangerouslySetInnerHTML={{ __html: ins.desc }} />

              {ins.steps && (
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>🔍 Agent 探索过程</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7, fontFamily: '"SF Mono", Menlo, monospace' }}>
                    {ins.steps.map((s, i) => <div key={i}>{s}</div>)}
                  </div>
                </div>
              )}

              <div style={{ background: ins.bg, borderLeft: `3px solid ${ins.accent}`, borderRadius: 6, padding: '10px 14px', fontSize: 12 }}>
                <span dangerouslySetInnerHTML={{ __html: ins.advice }} />
              </div>
            </div>
            <div className="card-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>发现时间:2026-07-14 14:00 · 涉及表:{ins.tables.join(', ')}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/chat/mock')}>
                深入对话分析 →
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
