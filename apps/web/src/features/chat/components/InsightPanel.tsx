import React from "react";
import { cn } from "../../../lib/utils";

/**
 * InsightPanel — 渲染 generate_insight 工具的结构化结果
 *
 * 输入 (与后端 InsightResultSchema 一一对应):
 *   summary: 一句话总结
 *   insights: [{ title, detail, severity, evidence? }]
 *   recommendation?: 可执行建议
 *
 * severity 配色:
 *   info         → 蓝色, 中性观察
 *   warning      → 黄色, 需关注
 *   opportunity  → 绿色, 增长机会
 *   risk         → 红色, 明确风险
 */

export type InsightSeverity = "info" | "warning" | "opportunity" | "risk";

export interface InsightItem {
  title: string;
  detail: string;
  severity: InsightSeverity;
  evidence?: string;
}

export interface InsightData {
  summary?: string;
  insights: InsightItem[];
  recommendation?: string;
}

const SEVERITY_META: Record<InsightSeverity, { icon: string; label: string }> = {
  info:        { icon: "ℹ️", label: "观察" },
  warning:     { icon: "⚠️", label: "需关注" },
  opportunity: { icon: "🚀", label: "机会" },
  risk:        { icon: "🔴", label: "风险" },
};

export function InsightPanel({ data }: { data: InsightData }) {
  if (!data || !data.insights || data.insights.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl overflow-hidden bg-muted border border-default">
      {/* 头部: summary + 总数徽章 */}
      <div className="px-4 py-3 border-b border-default" style={{ background: "linear-gradient(135deg, var(--bg-secondary), var(--bg-hover))" }}>
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-accent">
            🧠 商业洞察
          </div>
          <div className="text-xs px-2 py-0.5 rounded-full bg-surface text-muted border border-default">
            {data.insights.length} 条
          </div>
        </div>
        {data.summary && (
          <div className="text-sm font-medium leading-relaxed text-default">
            {data.summary}
          </div>
        )}
      </div>

      {/* 洞察列表 */}
      <div className="px-3 py-3 space-y-2">
        {data.insights.map((item, idx) => {
          const meta = SEVERITY_META[item.severity] ?? SEVERITY_META.info;
          return (
            <div
              key={idx}
              className={cn("rounded-lg p-3 transition-all hover:translate-x-0.5", `insight-card-${item.severity}`)}
            >
              <div className="flex items-start gap-2 mb-1">
                <span className="text-base leading-none">{meta.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-default">
                      {item.title}
                    </span>
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium text-white", `insight-badge-${item.severity}`)}>
                      {meta.label}
                    </span>
                  </div>
                </div>
              </div>
              <p className="text-xs leading-relaxed ml-7 text-secondary">
                {item.detail}
              </p>
              {item.evidence && (
                <div className="ml-7 mt-1.5 text-[11px] font-mono px-2 py-1 rounded inline-block bg-surface text-muted border border-default">
                  📊 {item.evidence}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 可执行建议 */}
      {data.recommendation && (
        <div className="px-4 py-3 border-t border-default bg-hover-custom">
          <div className="text-xs font-semibold mb-1 flex items-center gap-1 text-accent">
            💡 建议行动
          </div>
          <div className="text-xs leading-relaxed text-default">
            {data.recommendation}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * InsightSkeleton — 在 generate_insight tool_call 已发出但 tool_result 未到时显示。
 * 给用户即时反馈,避免 5-10 秒静默期(InsightAgent 二次 LLM pass)。
 */
export function InsightSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden bg-muted border border-default">
      <div className="px-4 py-3 border-b border-default flex items-center gap-2">
        <span className="text-base">🧠</span>
        <span className="text-xs font-semibold uppercase tracking-wide animate-pulse text-accent">
          正在生成商业洞察...
        </span>
      </div>
      <div className="px-3 py-3 space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-lg p-3 animate-pulse bg-hover-custom border-l-[3px] border-l-default"
          >
            <div className="h-3 w-1/3 rounded mb-2 bg-[var(--border)]" />
            <div className="h-2 w-full rounded mb-1 bg-[var(--border)]" />
            <div className="h-2 w-2/3 rounded bg-[var(--border)]" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default InsightPanel;