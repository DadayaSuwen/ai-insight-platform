import React from "react";

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

const SEVERITY_META: Record<
  InsightSeverity,
  { icon: string; label: string; bg: string; border: string; text: string }
> = {
  info: {
    icon: "ℹ️",
    label: "观察",
    bg: "rgba(59, 130, 246, 0.08)",
    border: "rgba(59, 130, 246, 0.3)",
    text: "#2563eb",
  },
  warning: {
    icon: "⚠️",
    label: "需关注",
    bg: "rgba(245, 158, 11, 0.08)",
    border: "rgba(245, 158, 11, 0.3)",
    text: "#d97706",
  },
  opportunity: {
    icon: "🚀",
    label: "机会",
    bg: "rgba(34, 197, 94, 0.08)",
    border: "rgba(34, 197, 94, 0.3)",
    text: "#16a34a",
  },
  risk: {
    icon: "🔴",
    label: "风险",
    bg: "rgba(239, 68, 68, 0.08)",
    border: "rgba(239, 68, 68, 0.3)",
    text: "#dc2626",
  },
};

export function InsightPanel({ data }: { data: InsightData }) {
  if (!data || !data.insights || data.insights.length === 0) {
    return null;
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border)",
      }}
    >
      {/* 头部: summary + 总数徽章 */}
      <div
        className="px-4 py-3 border-b"
        style={{
          borderColor: "var(--border)",
          background: "linear-gradient(135deg, var(--bg-secondary), var(--bg-hover))",
        }}
      >
        <div className="flex items-center justify-between mb-1">
          <div
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--accent)" }}
          >
            🧠 商业洞察
          </div>
          <div
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              background: "var(--bg-primary)",
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
            }}
          >
            {data.insights.length} 条
          </div>
        </div>
        {data.summary && (
          <div
            className="text-sm font-medium leading-relaxed"
            style={{ color: "var(--text-primary)" }}
          >
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
              className="rounded-lg p-3 transition-all hover:translate-x-0.5"
              style={{
                background: meta.bg,
                borderLeft: `3px solid ${meta.border}`,
              }}
            >
              <div className="flex items-start gap-2 mb-1">
                <span className="text-base leading-none">{meta.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="font-semibold text-sm"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {item.title}
                    </span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                      style={{
                        background: meta.border,
                        color: "white",
                      }}
                    >
                      {meta.label}
                    </span>
                  </div>
                </div>
              </div>
              <p
                className="text-xs leading-relaxed ml-7"
                style={{ color: "var(--text-secondary)" }}
              >
                {item.detail}
              </p>
              {item.evidence && (
                <div
                  className="ml-7 mt-1.5 text-[11px] font-mono px-2 py-1 rounded inline-block"
                  style={{
                    background: "var(--bg-primary)",
                    color: "var(--text-muted)",
                    border: "1px solid var(--border)",
                  }}
                >
                  📊 {item.evidence}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 可执行建议 */}
      {data.recommendation && (
        <div
          className="px-4 py-3 border-t"
          style={{
            borderColor: "var(--border)",
            background: "var(--bg-hover)",
          }}
        >
          <div
            className="text-xs font-semibold mb-1 flex items-center gap-1"
            style={{ color: "var(--accent)" }}
          >
            💡 建议行动
          </div>
          <div
            className="text-xs leading-relaxed"
            style={{ color: "var(--text-primary)" }}
          >
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
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border)",
      }}
    >
      <div
        className="px-4 py-3 border-b flex items-center gap-2"
        style={{ borderColor: "var(--border)" }}
      >
        <span className="text-base">🧠</span>
        <span
          className="text-xs font-semibold uppercase tracking-wide animate-pulse"
          style={{ color: "var(--accent)" }}
        >
          正在生成商业洞察...
        </span>
      </div>
      <div className="px-3 py-3 space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-lg p-3 animate-pulse"
            style={{
              background: "var(--bg-hover)",
              borderLeft: "3px solid var(--border)",
            }}
          >
            <div
              className="h-3 w-1/3 rounded mb-2"
              style={{ background: "var(--border)" }}
            />
            <div
              className="h-2 w-full rounded mb-1"
              style={{ background: "var(--border)" }}
            />
            <div
              className="h-2 w-2/3 rounded"
              style={{ background: "var(--border)" }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default InsightPanel;