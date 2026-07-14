import { useState } from 'react';
import { AlertTriangle, Lightbulb, Clock, ChevronDown, ChevronRight } from 'lucide-react';

interface Insight {
  id: string;
  type: 'risk' | 'anomaly' | 'opportunity';
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  detectedAt: string;
}

const INSIGHTS: Insight[] = [
  {
    id: '1', type: 'risk', severity: 'high',
    title: '客单价连续 2 月下降',
    description: 'Agent 在分析 orders.total_amt 时序数据时发现：客单价从 2026-05 的 ¥184.2 持续下降至 2026-07 的 ¥174.5 (-5.2%)。关联 customers.level 发现主因是 L1 新客户占比从 38% 上升至 52%。',
    detectedAt: '2026-07-14 14:00',
  },
  {
    id: '2', type: 'anomaly', severity: 'medium',
    title: 'app 渠道取消率异常上升',
    description: 'Agent 在分析 orders 表 status="cancelled" 分布时发现：app 渠道本月取消率 6.8%，远高于历史均值 3.2%（2.3σ 异常）。其他渠道正常。',
    detectedAt: '2026-07-14 14:00',
  },
  {
    id: '3', type: 'opportunity', severity: 'low',
    title: 'VIP 客户复购率显著提升',
    description: 'Agent 在分析 customers.level IN (4,5) 客户复购行为时发现：7 月 VIP 客户复购率达 38%，较上月 32% 提升 6 个百分点，与 6 月底「会员专享日」活动相关。',
    detectedAt: '2026-07-14 14:00',
  },
];

/**
 * [Sprint 6] 主动洞察页 — 对照 prototype 美化
 */
export default function InsightsPage() {
  const [range, setRange] = useState<'today' | 'week' | 'month'>('today');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">主动洞察 · Agent 自主发现</h1>
          <p className="page-subtitle">Agent 每日定时巡检 · 共 {INSIGHTS.length} 条今日洞察</p>
        </div>
        <div className="page-actions">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as 'today' | 'week' | 'month')}
            className="input"
            style={{ width: 120 }}
          >
            <option value="today">今日</option>
            <option value="week">本周</option>
            <option value="month">本月</option>
          </select>
          <button className="btn btn-secondary btn-sm">
            <Clock size={14} /> 配置巡检
          </button>
        </div>
      </div>

      {/* 巡检状态 */}
      <div className="card" style={{ marginBottom: 16, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'var(--green-lighter)', color: 'var(--green-dark)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Clock size={18} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>今日巡检已完成</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              14:00 触发 · 耗时 47s · 检查 12 项指标
            </div>
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
          <InsightCard
            key={ins.id}
            insight={ins}
            expanded={expandedId === ins.id}
            onToggle={() => setExpandedId(expandedId === ins.id ? null : ins.id)}
          />
        ))}
      </div>
    </>
  );
}

function InsightCard({ insight, expanded, onToggle }: { insight: Insight; expanded: boolean; onToggle: () => void }) {
  const typeConfig = {
    risk: { icon: '🔴', color: 'var(--error)', bg: 'var(--error-light)' },
    anomaly: { icon: '⚠️', color: 'var(--warning)', bg: 'var(--warning-light)' },
    opportunity: { icon: '💡', color: 'var(--green-dark)', bg: 'var(--green-lighter)' },
  };
  const cfg = typeConfig[insight.type];
  const typeLabel = insight.type === 'risk' ? '风险' : insight.type === 'anomaly' ? '异常' : '机会';

  return (
    <div className="card">
      <div
        className="card-header"
        style={{ background: cfg.bg, borderBottom: '1px solid var(--border-light)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>{cfg.icon}</span>
          <div>
            <div className="card-title" style={{ color: cfg.color }}>{insight.title}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {typeLabel} · 严重度 {insight.severity} · 置信度 92%
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost btn-sm">标记已处理</button>
          <button className="btn btn-ghost btn-sm">屏蔽此类</button>
        </div>
      </div>

      <div className="card-body">
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>{insight.description}</p>

        <button
          onClick={onToggle}
          style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--accent)' }}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {expanded ? '收起' : '展开'} Agent 探索过程
        </button>
        {expanded && (
          <div
            style={{
              marginTop: 8,
              background: 'var(--bg-secondary)', borderRadius: 8,
              padding: 12, fontFamily: '"SF Mono", Menlo, monospace',
              fontSize: 11, lineHeight: 1.7, color: 'var(--text-secondary)',
            }}
          >
            1. 检测指标时序异常 → 发现连续下降<br />
            2. 假设 1: 季节性? → 对比去年同期, 排除<br />
            3. 假设 2: 品类结构变化? → 各品类占比稳定, 排除<br />
            4. 假设 3: 客户结构变化? → 关联 customers.level, 命中!<br />
            5. 验证: L1 占比上升 14pp, 符合降幅
          </div>
        )}

        <div
          style={{
            marginTop: 12,
            padding: '10px 14px',
            background: 'var(--green-lighter)',
            borderLeft: '3px solid var(--green)',
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          <strong style={{ color: 'var(--green-darker)' }}>💡 Agent 建议：</strong>
          <span> 1) 排查下降原因 · 2) 评估转化路径 · 3) 监控是否企稳</span>
        </div>
      </div>

      <div className="card-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>发现时间: {insight.detectedAt} · 涉及表: orders, customers</span>
        <button className="btn btn-ghost btn-sm">深入对话分析 →</button>
      </div>
    </div>
  );
}
