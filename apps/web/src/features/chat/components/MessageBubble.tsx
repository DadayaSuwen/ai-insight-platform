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
}: {
  chartKey: string;
  chartOption: Record<string, unknown>;
  fallbackRows?: Array<Record<string, any>>;
  chartRefs: React.MutableRefObject<Map<string, DynamicChartHandle>>;
  onExportPng: (key: string) => void;
  /** [M5-Patch] 地图类型,来自后端 intent.mapType */
  mapType?: string;
}) {
  // [M13-V2] GUARD-V2-3: V2 移除 showTable state, fallbackRows 直接透传到 Boundary
  // Canvas 像素探针触发 onError 时, Boundary 自动渲染 CollapsibleTable (无需用户点击)
  return (
    <>
      <ChartErrorBoundary
        onError={(err) => {
          console.error("[GUARD-2a / GUARD-V2-3] chart render failed:", err);
        }}
        fallbackRows={fallbackRows}  // [M13-V2] 直接传 rows
      >
        <DynamicChart
          ref={(handle) => {
            if (handle) chartRefs.current.set(chartKey, handle);
            else chartRefs.current.delete(chartKey);
          }}
          option={chartOption}
          mapType={mapType}  // [M5-Patch] 透传到 ensureMap
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
}: {
  message: ChatMessage;
  onSuggestionClick: (text: string) => void;
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
        <div
          className="max-w-[80%] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm text-white shadow-sm"
          style={{ background: "var(--accent)" }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  // ─── 助手消息 ───────────────────────────────────────────
  const msg = message as AssistantMessage;

  // 判断是否处于完全空白的状态（没文字、没工具调用结果、正在加载中）
  const isEmptyThinking =
    !msg.isFinal && !msg.content && (msg.toolCalls?.length ?? 0) === 0;

  // 1. 如果是空白思考状态，渲染一个极简的打字机气泡，防止出现丑陋的空气泡
  if (isEmptyThinking) {
    return (
      <div className="flex justify-start">
        <div
          className="flex items-center gap-1 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm"
          style={{
            background: "var(--bg-primary)",
            border: "1px solid var(--border)",
          }}
        >
          <span className="thinking-dot"></span>
          <span className="thinking-dot"></span>
          <span className="thinking-dot"></span>
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
        {/* (A) 工具调用状态时间线 (合并连续相同工具) */}
        {(msg.toolCalls?.length ?? 0) > 0 && (
          <div
            className="mb-3 space-y-2 border-b pb-3"
            style={{ borderColor: "var(--border)" }}
          >
            {msg
              .toolCalls!.reduce(
                (
                  acc: { name: string; count: number; hasResult: boolean }[],
                  call,
                  idx,
                ) => {
                  // 如果和上一个工具同名，累加次数
                  if (
                    acc.length > 0 &&
                    acc[acc.length - 1].name === call.name
                  ) {
                    acc[acc.length - 1].count++;
                    // 只要当前有结果，就把这组标记为有结果
                    if ((msg.toolResults?.length ?? 0) > idx) {
                      acc[acc.length - 1].hasResult = true;
                    }
                  } else {
                    acc.push({
                      name: call.name,
                      count: 1,
                      hasResult: (msg.toolResults?.length ?? 0) > idx,
                    });
                  }
                  return acc;
                },
                [],
              )
              .map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  {item.hasResult ? (
                    <span style={{ color: "var(--success)" }}>✓</span>
                  ) : (
                    <span className="animate-pulse">⏳</span>
                  )}
                  <span>
                    {item.hasResult ? "已完成" : "正在执行"}：{item.name}
                    {item.count > 1 && ` (共 ${item.count} 次)`}
                  </span>
                </div>
              ))}
          </div>
        )}

        {/* (B) 工具返回的结果 (图表 / 表格 / 洞察) */}
        {(msg.toolResults?.length ?? 0) > 0 && (
          <div className="mb-3 space-y-4">
            {msg.toolResults!.map((res, idx) => {
              if (res.name === "gen_chart" && res.result.chart) {
                // M3 chartSource 标签: 🤖 LLM 生成 / 📊 模板兜底
                const chartSource = res.result.chartSource as string | undefined;
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
                          {chartSource === "fallback" ? "📊 模板生成" : "🤖 LLM 生成"}
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
                    />
                  </div>
                );
              }
              if (res.name === "query_sales" && res.result.summary) {
                return (
                  <CollapsibleTable
                    key={idx}
                    rows={res.result.summary as any[]}
                  />
                );
              }
              // query_details: 返回 { groupByField, label, metrics, metricLabels, rows }
              if (res.name === "query_details" && res.result.rows) {
                const label = (res.result.label as string) ?? "维度";
                const metricLabels = (res.result.metricLabels as Record<string, string>) ?? {};
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
                    <CollapsibleTable rows={rows} />
                  </div>
                );
              }
              // generate_insight: 返回 { summary, insights[], recommendation }
              if (res.name === "generate_insight" && res.result.insights) {
                return (
                  <InsightPanel
                    key={idx}
                    data={res.result as any}
                  />
                );
              }
              return null;
            })}
          </div>
        )}

        {/* (B-Skeleton) generate_insight tool_call 已发出但 tool_result 未到 */}
        {!msg.isFinal &&
          (msg.toolCalls?.some((c) => c.name === "generate_insight") ?? false) &&
          !(msg.toolResults?.some((r) => r.name === "generate_insight") ?? false) && (
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

        {/* (E) 错误信息 */}
        {msg.error && (
          <div
            className="mt-2 rounded-lg p-2 text-xs"
            style={{ background: "var(--error-light)", color: "var(--error)" }}
          >
            {msg.error.message}
          </div>
        )}
        {/* (F) 动态追问按钮 */}
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

// 通用的可折叠数据表格组件 (完全动态)
// [M13-V2] GUARD-V2-3: CollapsibleTable 已抽出到独立文件 ./CollapsibleTable.tsx
// 旧的本地定义已删除, 顶部 import 指向 ./CollapsibleTable.tsx
// CollapsibleTable_DELETED_PLACEHOLDER 已被替换

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
  const hasTable =
    message.toolResults?.some(
      (r) => r.name === "query_sales" || r.name === "query_details",
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
