import React, { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm"; // ★ 引入插件
import DynamicChart, { type DynamicChartHandle } from "./DynamicChart";
import { ChartErrorBoundary } from "./ChartErrorBoundary";
import { CollapsibleTable } from "./CollapsibleTable"; // [M13-V2] 抽出独立组件
import { InsightPanel, InsightSkeleton } from "./InsightPanel";
import type { ChatMessage, AssistantMessage } from "../types";
import { Button } from "../../../components/ui/button";

/**
 * [M6-L4 / M13-V2] ChartWithFallback — 单个图表 + 表格降级子组件
 *
 * [M6-L4] 抽出这个组件是为了使用 useState 控制"切表格"toggle;
 *        直接在 MessageBubble 的 .map 内联渲染会破坏 hooks 规则。
 * [M13-V2] GUARD-V2-3: V2 移除 showTable toggle,fallbackRows 直接透传到 ChartErrorBoundary
 *        Canvas 像素探针触发 onError 时,Boundary 自动渲染表格(无需用户点击)
 */
function ChartWithFallback({
  chartKey,
  chartOption,
  fallbackRows,
  chartRefs,
  onExportPng,
  mapType,
  fieldMapping,
}: {
  chartKey: string;
  chartOption: Record<string, unknown>;
  fallbackRows?: Array<Record<string, any>>;
  chartRefs: React.MutableRefObject<Map<string, DynamicChartHandle>>;
  onExportPng: (key: string) => void;
  /** [M5-Patch] 地图类型,来自后端 intent.mapType */
  mapType?: string;
  /** [Sprint 5.7] 物理名 → 中文名映射表 */
  fieldMapping?: Record<string, string>;
}) {
  // [M13-V2] GUARD-V2-3: V2 移除 showTable state, fallbackRows 直接透传到 Boundary
  // Canvas 像素探针触发 onError 时, Boundary 自动渲染 CollapsibleTable (无需用户点击)
  return (
    <>
      <ChartErrorBoundary
        onError={(err) => {
          console.error("[GUARD-2a / GUARD-V2-3] chart render failed:", err);
        }}
        fallbackRows={fallbackRows} // [M13-V2] 直接传 rows
        fieldMapping={fieldMapping} // [Sprint 5.7]
      >
        <DynamicChart
          ref={(handle) => {
            if (handle) chartRefs.current.set(chartKey, handle);
            else chartRefs.current.delete(chartKey);
          }}
          option={chartOption}
          mapType={mapType} // [M5-Patch] 透传到 ensureMap
          enableResize={true}
        />
      </ChartErrorBoundary>
      <div className="mt-2 flex justify-end">
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px]"
          onClick={() => onExportPng(chartKey)}
          title="导出 PNG"
        >
          📥 导出 PNG
        </Button>
      </div>
    </>
  );
}

/**
 * MessageBubble — 渲染单条消息
 *
 * 适配新的 Agent 架构：
 * 1. 渲染流式 Markdown 文本 (content)
 * 2. 渲染工具调用状态时间线 (toolCalls)
 * 3. 渲染工具返回的结果 (toolResults: 图表/表格)
 */
function MessageBubble({
  message,
  onSuggestionClick,
  onRetry,
  onEdit,
}: {
  message: ChatMessage;
  onSuggestionClick: (text: string) => void;
  /** [Sprint 5.7+] 重新生成: 重新发送上一条用户消息 */
  onRetry?: () => void;
  /** [Sprint 5.7+] 编辑: 将用户消息文本填入输入框 */
  onEdit?: (text: string) => void;
}) {
  const isUser = message.role === "user";

  // M5 (GUARD-5b): 每个 gen_chart 渲染需要一个 ref 调 exportPng()
  const chartRefs = useRef<Map<string, DynamicChartHandle>>(new Map());

  const handleExportPng = (toolResultId: string) => {
    const handle = chartRefs.current.get(toolResultId);
    if (!handle) return;
    const dataUrl = handle.exportPng();
    if (!dataUrl) {
      console.warn("[GUARD-5b] exportPng returned null (instance not ready)");
      return;
    }
    // 触发下载
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `chart-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ─── 用户消息 ───────────────────────────────────────────
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%]">
          <div
            className="rounded-2xl rounded-br-sm px-4 py-2.5 text-sm text-white shadow-sm"
            style={{ background: "var(--accent)" }}
          >
            {message.content}
          </div>
          <div className="mt-1 flex justify-end gap-1">
            {/* 编辑 */}
            {onEdit && (
              <button
                onClick={() => onEdit(message.content)}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors hover:opacity-70"
                style={{ color: "var(--text-muted)" }}
                title="编辑"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                编辑
              </button>
            )}
            {/* 复制 */}
            <button
              onClick={() => navigator.clipboard.writeText(message.content).catch(() => {})}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors hover:opacity-70"
              style={{ color: "var(--text-muted)" }}
              title="复制"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              复制
            </button>
            {/* 重新生成 */}
            {onRetry && (
              <button
                onClick={onRetry}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors hover:opacity-70"
                style={{ color: "var(--text-muted)" }}
                title="重新生成"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                重试
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── 助手消息 ───────────────────────────────────────────
  const msg = message as AssistantMessage;

  // 判断是否处于完全空白的状态（没文字、没工具调用结果、正在加载中）
  const isEmptyThinking =
    !msg.isFinal && !msg.content && (msg.toolCalls?.length ?? 0) === 0;

  // 1. 如果是空白思考状态，渲染思考中占位
  if (isEmptyThinking) {
    return (
      <div className="flex justify-start">
        <div
          className="flex items-center gap-2 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm"
          style={{
            background: "var(--bg-primary)",
            border: "1px solid var(--border)",
          }}
        >
          <svg className="animate-spin-slow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
            <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
          </svg>
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            思考中...
          </span>
        </div>
      </div>
    );
  }

  // 2. 正常渲染有内容或有工具状态的气泡
  return (
    <div className="flex justify-start">
      <div
        className="max-w-[85%] w-full rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm"
        style={{
          background: "var(--bg-primary)",
          border: "1px solid var(--border)",
        }}
      >
        {/* (A) 深度思考过程 — 可折叠步骤时间线 */}
        {(msg.toolCalls?.length ?? 0) > 0 && (
          <ThinkProcess msg={msg} />
        )}

        {/* (B) 工具返回的结果 (图表 / 表格 / 洞察) */}
        {(msg.toolResults?.length ?? 0) > 0 && (
          <div className="mb-3 space-y-4">
            {msg.toolResults!.map((res, idx) => {
              if (res.name === "gen_chart" && res.result.chart) {
                // M3 chartSource 标签: 🤖 LLM 生成 / 📊 模板兜底
                const chartSource = res.result.chartSource as
                  | string
                  | undefined;
                // M5: ref 用来调 exportPng (GUARD-5b)
                const chartKey = res.id ?? `chart-${idx}`;
                // [M6-L4] 提取 fallbackRows 供表格降级用
                const fallbackRows = res.result.rows as
                  | Array<Record<string, any>>
                  | undefined;
                // [M5-Patch] 读取 intent (后端 chartAgent 返回) → 透传到 DynamicChart
                const intent = (res.result.intent ?? {}) as {
                  mapType?: string;
                  layout?: "inline" | "fullscreen";
                };
                const isFullscreen = intent.layout === "fullscreen";
                return (
                  <div
                    key={idx}
                    className={`rounded-lg p-2 ${isFullscreen ? "w-full" : ""}`}
                    style={{ background: "var(--bg-secondary)" }}
                  >
                    <div className="mb-2 flex items-center justify-between gap-1 text-[10px]">
                      {chartSource && (
                        <span style={{ color: "var(--text-muted)" }}>
                          {chartSource === "fallback"
                            ? "📊 模板生成"
                            : "🤖 LLM 生成"}
                        </span>
                      )}
                      {/* [M5-Patch] 全屏标识提示 */}
                      {isFullscreen && (
                        <span style={{ color: "var(--text-muted)" }}>
                          ⛶ 全屏展示
                        </span>
                      )}
                    </div>
                    <ChartWithFallback
                      chartKey={chartKey}
                      chartOption={res.result.chart as Record<string, unknown>}
                      fallbackRows={fallbackRows}
                      chartRefs={chartRefs}
                      onExportPng={handleExportPng}
                      mapType={intent.mapType}
                      fieldMapping={
                        res.result.fieldMapping as
                          | Record<string, string>
                          | undefined
                      }
                    />
                  </div>
                );
              }
              // query_details: 返回 { groupByField, label, metrics, metricLabels, rows }
              if (res.name === "query_details" && res.result.rows) {
                const label = (res.result.label as string) ?? "维度";
                const metricLabels =
                  (res.result.metricLabels as Record<string, string>) ?? {};
                const rows = res.result.rows as Record<string, any>[];
                return (
                  <div key={idx} className="space-y-1">
                    <div
                      className="text-xs flex items-center gap-2"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <span>📋 按 {label}</span>
                      {(res.result.metrics as string[])?.map((m) => (
                        <span
                          key={m}
                          className="px-1.5 py-0.5 rounded text-[10px]"
                          style={{
                            background: "var(--bg-hover)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {metricLabels[m] ?? m}
                        </span>
                      ))}
                    </div>
                    <CollapsibleTable
                      rows={rows}
                      fieldMapping={
                        res.result.fieldMapping as
                          | Record<string, string>
                          | undefined
                      }
                    />
                  </div>
                );
              }
              // generate_insight: 返回 { summary, insights[], recommendation }
              if (res.name === "generate_insight" && res.result.insights) {
                return <InsightPanel key={idx} data={res.result as any} />;
              }
              return null;
            })}
          </div>
        )}

        {/* (B-Skeleton) generate_insight tool_call 已发出但 tool_result 未到 */}
        {!msg.isFinal &&
          (msg.toolCalls?.some((c) => c.name === "generate_insight") ??
            false) &&
          !(
            msg.toolResults?.some((r) => r.name === "generate_insight") ?? false
          ) && (
            <div className="mb-3">
              <InsightSkeleton />
            </div>
          )}

        {/* (C) 正在思考的动画 (有工具调用但还没开始吐文本时) */}
        {!msg.content && (msg.toolCalls?.length ?? 0) > 0 && !msg.isFinal && (
          <div
            className="flex items-center gap-1 text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            <span className="thinking-dot"></span>
            <span className="thinking-dot"></span>
            <span className="thinking-dot"></span>
          </div>
        )}

        {/* (D) LLM 最终的 Markdown 文本回复 + 流式光标 */}
        {msg.content && (
          <div
            className="prose prose-sm max-w-none dark:prose-invert text-sm leading-relaxed"
            style={{ color: "var(--text-primary)" }}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]} // ★ 启用插件
              components={{
                table: ({ node, ...props }) => (
                  <div className="overflow-x-auto my-4 w-full">
                    <table
                      className="border-collapse w-full text-xs"
                      style={{ border: "1px solid var(--border)" }}
                      {...props}
                    />
                  </div>
                ),
                th: ({ node, ...props }) => (
                  <th
                    className="px-3 py-2 text-left font-semibold"
                    style={{
                      border: "1px solid var(--border)",
                      background: "var(--bg-hover)",
                    }}
                    {...props}
                  />
                ),
                td: ({ node, ...props }) => (
                  <td
                    className="px-3 py-2"
                    style={{ border: "1px solid var(--border)" }}
                    {...props}
                  />
                ),
              }}
            >
              {msg.content + (!msg.isFinal ? " ▋" : "")}
            </ReactMarkdown>
          </div>
        )}

        {/* (E) AI 回复操作: 复制 */}
        {msg.isFinal && msg.content && (
          <div className="mt-2 flex items-center gap-1 border-t pt-2" style={{ borderColor: "var(--border)" }}>
            <button
              onClick={() => {
                navigator.clipboard
                  .writeText(msg.content)
                  .then(() => {
                    // 短暂视觉反馈
                  })
                  .catch(() => {});
              }}
              className="flex items-center gap-1 rounded px-2 py-1 text-[10px] transition-colors hover:opacity-80"
              style={{ color: "var(--text-muted)" }}
              title="复制回复"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              复制
            </button>
          </div>
        )}
        {/* (F) 错误信息 */}
        {msg.error && (
          <div
            className="mt-2 rounded-lg p-2 text-xs"
            style={{ background: "var(--error-light)", color: "var(--error)" }}
          >
            {msg.error.message}
          </div>
        )}
        {/* (G) 动态追问按钮 */}
        {msg.isFinal && (
          <DynamicSuggestions
            message={msg}
            onSend={(text) => {
              onSuggestionClick(text);
            }}
          />
        )}
      </div>
    </div>
  );
}

// [Sprint 5.7+] 思考过程 — 可折叠步骤
const TOOL_META: Record<string, { label: string; color: string }> = {
  query_details: { label: "查询数据", color: "#3b82f6" },
  gen_chart: { label: "生成图表", color: "#8b5cf6" },
  generate_insight: { label: "分析洞察", color: "#f59e0b" },
  get_table_schema: { label: "探索结构", color: "#6b7280" },
};

function ThinkProcess({ msg }: { msg: AssistantMessage }) {
  const [collapsed, setCollapsed] = useState(false);
  const allDone = msg.toolCalls!.length === (msg.toolResults?.length ?? 0);
  const steps = msg.toolCalls!.reduce(
    (acc: { name: string; count: number; done: boolean }[], call, idx) => {
      const done = (msg.toolResults?.length ?? 0) > idx;
      const last = acc[acc.length - 1];
      if (last && last.name === call.name && last.done === done) { last.count++; return acc; }
      acc.push({ name: call.name, count: 1, done });
      return acc;
    }, [],
  );

  return (
    <div className="mb-3 border-b pb-2" style={{ borderColor: "var(--border)" }}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-1.5 text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
        <span>{allDone ? "思考完成" : "思考中"}</span>
        <span className="tabular-nums">· {steps.length} 步</span>
        <span className="ml-auto">{collapsed ? "▶" : "▼"}</span>
      </button>
      {!collapsed && (
        <div className="ml-5 mt-1.5 space-y-1">
          {steps.map((step, i) => {
            const meta = TOOL_META[step.name] ?? { label: step.name, color: "#6b7280" };
            return (
              <div key={i} className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                <span className="flex h-2 w-2 rounded-full" style={{ background: step.done ? "var(--success)" : meta.color }}>
                  {step.done && (
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" style={{margin:"auto"}}>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                <span style={{ color: step.done ? "var(--text-secondary)" : "var(--text-primary)" }}>
                  {meta.label}
                </span>
                {step.count > 1 && <span>×{step.count}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// 智能追问组件
function DynamicSuggestions({
  message,
  onSend,
}: {
  message: AssistantMessage;
  onSend: (text: string) => void;
}) {
  let suggestions: { label: string; query: string }[] = [];

  const hasChart = message.toolResults?.some((r) => r.name === "gen_chart");
  const hasTable = message.toolResults?.some(
    (r) => r.name === "query_details" || r.name === "gen_chart",
  );
  const hasInsight = message.toolResults?.some(
    (r) => r.name === "generate_insight",
  );

  // 根据上一轮的结果，推荐不同的下一步动作
  if (hasInsight) {
    // 已经有洞察,引导用户深入某个具体方向
    suggestions.push({
      label: "📊 画个图看看",
      query: "把刚才分析的数据画成可视化图表",
    });
    suggestions.push({
      label: "🔍 Top 10 明细",
      query: "列出销售额最高的 10 个客户/产品,我要看具体数字",
    });
  } else if (hasChart && !hasTable) {
    suggestions.push({
      label: "📋 查看明细数据",
      query: "把刚才的数据用表格详细列出来",
    });
    suggestions.push({
      label: "🧠 提取商业洞察",
      query: "基于刚才的数据,给我一些商业洞察和风险提示",
    });
  } else if (hasTable && !hasChart) {
    suggestions.push({
      label: "📊 生成可视化图表",
      query: "把刚才的数据画成图表展示",
    });
    suggestions.push({
      label: "🧠 提取商业洞察",
      query: "基于刚才的数据,给我一些商业洞察和风险提示",
    });
  } else if (hasTable && hasChart) {
    suggestions.push({
      label: "🧠 提取商业洞察",
      query: "基于刚才的数据，给我提供一些具体的商业行动建议",
    });
  }

  if (suggestions.length === 0) return null;

  return (
    <div
      className="mt-3 flex flex-wrap gap-2 border-t pt-3"
      style={{ borderColor: "var(--border)" }}
    >
      {suggestions.map((s, idx) => (
        <button
          key={idx}
          onClick={() => onSend(s.query)}
          className="rounded-full px-3 py-1 text-xs transition-colors"
          style={{
            background: "var(--bg-hover)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border)",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--bg-tertiary)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "var(--bg-hover)")
          }
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
export default MessageBubble;
