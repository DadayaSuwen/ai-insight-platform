import React, { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm"; // ★ 引入插件
import DynamicChart, { type DynamicChartHandle } from "./DynamicChart";
import { ChartErrorBoundary } from "./ChartErrorBoundary";
import { CollapsibleTable } from "./CollapsibleTable"; // [M13-V2] 抽出独立组件
import { InsightPanel, InsightSkeleton } from "./InsightPanel";
import type { ChatMessage, AssistantMessage, ToolResultData } from "../types";
import { Button } from "../../../components/ui/button";
import { highlightSql } from "../../../lib/sql-highlight";

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
 * [UI 对齐原型] 32px 渐变头像圆圈 — 还原 docs/implementation/index.html 的 .review-avatar
 *   - AI:  绿→深绿渐变 (--green → --green-dark)
 *   - 用户: 琥珀→橙渐变 (--amber → --orange)
 */
function ReviewAvatar({ kind }: { kind: "ai" | "user" }) {
  const gradient =
    kind === "ai"
      ? "linear-gradient(135deg, var(--green), var(--green-dark))"
      : "linear-gradient(135deg, var(--amber), var(--orange))";
  return (
    <div
      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white shadow-sm"
      style={{ background: gradient }}
      aria-hidden
    >
      {kind === "ai" ? "AI" : "我"}
    </div>
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
      <div className="flex flex-row-reverse items-start gap-3">
        <ReviewAvatar kind="user" />
        <div className="max-w-[80%]">
          <div
            className="rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm shadow-sm text-default"
            style={{ background: "var(--green-lighter)" }}
          >
            {message.content}
          </div>
          <div className="mt-1 flex justify-end gap-1">
            {/* 编辑 */}
            {onEdit && (
              <button
                onClick={() => onEdit(message.content)}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:opacity-70"
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
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:opacity-70"
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
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:opacity-70"
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
      <div className="flex items-start gap-3">
        <ReviewAvatar kind="ai" />
        <div
          className="flex items-center gap-2 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm bg-muted"
        >
          <svg className="animate-spin-slow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
            <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
          </svg>
          <span className="text-sm text-muted">
            思考中...
          </span>
        </div>
      </div>
    );
  }

  // 2. 正常渲染有内容或有工具状态的气泡
  return (
    <div className="flex items-start gap-3">
      <ReviewAvatar kind="ai" />
      <div
        className="max-w-[85%] w-full rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm bg-muted"
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
                    className={`rounded-lg p-2 bg-muted ${isFullscreen ? "w-full" : ""}`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-1 text-[10px]">
                      {chartSource && (
                        <span className="text-muted">
                          {chartSource === "fallback"
                            ? "📊 模板生成"
                            : "🤖 LLM 生成"}
                        </span>
                      )}
                      {/* [M5-Patch] 全屏标识提示 */}
                      {isFullscreen && (
                        <span className="text-muted">
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
              // query_details: 渲染为单卡片(header + SQL 块 + footer + 查询结果)
              if (res.name === "query_details" && res.result.rows) {
                const matchingCall = msg.toolCalls?.find((c) => c.id === res.id);
                return <QueryDataCard key={idx} res={res} args={matchingCall?.args} />;
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
            className="flex items-center gap-1 text-sm text-muted"
          >
            <span className="thinking-dot"></span>
            <span className="thinking-dot"></span>
            <span className="thinking-dot"></span>
          </div>
        )}

        {/* (D) LLM 最终的 Markdown 文本回复 + 流式光标 */}
        {msg.content && (
          <div
            className="prose prose-sm max-w-none dark:prose-invert text-sm leading-relaxed text-default"
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]} // ★ 启用插件
              components={{
                table: ({ node, ...props }) => (
                  <div className="overflow-x-auto my-4 w-full">
                    <table
                      className="border-collapse w-full text-xs border border-default"
                      {...props}
                    />
                  </div>
                ),
                th: ({ node, ...props }) => (
                  <th
                    className="px-3 py-2 text-left font-semibold border border-default bg-hover-custom"
                    {...props}
                  />
                ),
                td: ({ node, ...props }) => (
                  <td
                    className="px-3 py-2 border border-default"
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
          <div className="mt-2 flex items-center gap-1 border-t pt-2 border-default">
            <button
              onClick={() => {
                navigator.clipboard
                  .writeText(msg.content)
                  .then(() => {
                    // 短暂视觉反馈
                  })
                  .catch(() => {});
              }}
              className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-muted transition-colors hover:opacity-80"
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
            className="mt-2 rounded-lg p-2 text-xs bg-error-light text-error"
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

// [Sprint 5.7+] 思考过程 — 可折叠步骤（配色对齐暖色系原型主题变量）
const TOOL_META: Record<string, { label: string; color: string }> = {
  query_details: { label: "查询数据", color: "var(--green)" },
  gen_chart: { label: "生成图表", color: "var(--info)" },
  generate_insight: { label: "分析洞察", color: "var(--amber)" },
  get_table_schema: { label: "探索结构", color: "var(--text-muted)" },
};

// [本次重构] ThinkProcess — 卡片式:header(状态徽标 + 步数) + 最近 3 步逐条 + 进度条
// 进度色 / 文本色 / 边框统一用主题变量;深浅色自适应。
function ThinkProcess({ msg }: { msg: AssistantMessage }) {
  const [open, setOpen] = useState(false);
  const calls = msg.toolCalls ?? [];
  const doneCount = msg.toolResults?.length ?? 0;
  const allDone = calls.length > 0 && doneCount >= calls.length;
  // 取最近 3 步,逐条独立渲染,不再合并 ×N
  const VISIBLE_N = 3;
  const visible = calls.slice(-VISIBLE_N);
  const baseIdx = calls.length - visible.length;
  const ratio = calls.length > 0 ? Math.min(100, (doneCount / calls.length) * 100) : 0;

  return (
    <div
      className="mb-3 overflow-hidden rounded-lg border bg-muted border-default"
    >
      {/* Header: 时钟 + 文案 + 状态徽标 + chevron */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-secondary"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
        <span className="font-semibold">
          {allDone ? "思考完成" : "思考中"} · {calls.length} 步
        </span>
        {/* 状态徽标:done → 绿色实心 + ✓;pending → 琥珀色 animate-pulse */}
        {calls.length > 0 && (
          <span
            className={
              "flex h-4 w-4 items-center justify-center rounded-full text-white " +
              (allDone ? "" : "animate-pulse")
            }
            style={{
              background: allDone ? "var(--green)" : "var(--amber)",
            }}
            title={allDone ? "已完成" : "进行中"}
          >
            {allDone ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <span className="block h-1.5 w-1.5 rounded-full bg-white/90" />
            )}
          </span>
        )}
        <span className="ml-auto text-muted">
          {open ? "▼" : "▶"}
        </span>
      </button>

      {/* 步骤列表(展开时) */}
      {open && visible.length > 0 && (
        <div
          className="max-h-48 space-y-1 overflow-y-auto border-t px-3 py-2 border-default"
        >
          {visible.map((c, i) => {
            const idx = baseIdx + i;
            const stepDone = doneCount > idx;
            const meta = TOOL_META[c.name] ?? {
              label: c.name,
              color: "var(--text-muted)",
            };
            const subtitle = argSummary(c.args);
            return (
              <div
                key={`${c.id ?? idx}`}
                className="flex items-center gap-2 py-1 text-[11px]"
              >
                {/* 状态圆点:已完成 → 绿色实心 + ✓;当前进行中 → 琥珀 animate-pulse;未来 → 灰 */}
                <span
                  className={
                    "flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full " +
                    (stepDone
                      ? ""
                      : idx === doneCount
                        ? "animate-pulse"
                        : "")
                  }
                  style={{
                    background: stepDone
                      ? "var(--green)"
                      : idx === doneCount
                        ? meta.color
                        : "var(--bg-hover)",
                    color: stepDone ? "white" : "transparent",
                  }}
                >
                  {stepDone && (
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="3"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                <span
                  className="flex-shrink-0 font-medium"
                  data-tool-name={c.name}
                  style={{ color: meta.color }}
                >
                  {meta.label}
                </span>
                {subtitle && (
                  <span
                    className="truncate text-muted"
                  >
                    · {subtitle}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 进度条(底部 2px):doneCount/calls.length */}
      {calls.length > 0 && (
        <div
          className="h-0.5 w-full bg-hover-custom"
          aria-label={`完成 ${doneCount}/${calls.length}`}
        >
          <div
            className="h-full transition-all"
            style={{
              width: `${ratio}%`,
              background: allDone ? "var(--green)" : "var(--amber)",
            }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * [本次重构] argSummary — 把工具 args 截断成一句短副标题。
 * 例: { topN: 5, orderBy: 'sales desc' } → "Top 5 · 按销售额 desc"
 * 安全:任意字段缺失/类型异常都返回 ""。
 */
function argSummary(args: Record<string, unknown> | undefined): string {
  if (!args || typeof args !== "object") return "";
  const parts: string[] = [];
  const topN =
    (args as any).topN ?? (args as any).limit ?? (args as any).topK;
  if (typeof topN === "number" && topN > 0) parts.push(`Top ${topN}`);
  const orderBy = (args as any).orderBy;
  if (typeof orderBy === "string" && orderBy) parts.push(`按 ${orderBy}`);
  const groupBy = (args as any).groupBy;
  if (Array.isArray(groupBy) && groupBy.length > 0) {
    parts.push(`按 ${(groupBy as string[]).join("/")}`);
  } else if (typeof groupBy === "string" && groupBy) {
    parts.push(`按 ${groupBy}`);
  }
  const table = (args as any).table;
  if (typeof table === "string" && table && parts.length === 0) {
    parts.push(table);
  }
  return parts.join(" · ");
}

/**
 * [本次重构] describeArgs — 把 query_details 工具的 args 翻译成一句中文用途描述,
 * 显示在 QueryDataCard header 上(`调用工具: query_data · 关联 products 和 orders 表 ...`)。
 *
 * 优先级:
 *   1. topN + metrics + groupBy  → "Top N {metricLabel} 按 {groupByLabel}"
 *   2. metrics + groupBy          → "{metricLabel} 按 {groupByLabel}"
 *   3. 只有 table                 → 表名
 *   4. 都不足                      → 回退 argSummary(args)
 *
 * 注意:不硬编码与原型截图完全一致的句子 —— 原型是 mock,真实 args 形态多样,做一个 deterministic 可读短语即可。
 */
function describeArgs(args: Record<string, unknown> | undefined): string {
  if (!args || typeof args !== "object") return "";
  const a = args as any;
  const groupByRaw = Array.isArray(a.groupBy)
    ? a.groupBy
    : typeof a.groupBy === "string" && a.groupBy
      ? [a.groupBy]
      : [];
  const metricsRaw = Array.isArray(a.metrics)
    ? a.metrics
      .map((m: any) => (typeof m === "string" ? m : m?.alias ?? m?.label ?? m?.column ?? ""))
      .filter(Boolean)
    : [];
  const topN = typeof a.topN === "number" && a.topN > 0 ? a.topN : null;

  const metricLabel = metricsRaw[0] ?? "";
  const groupByLabel = groupByRaw[0] ?? "";

  // 1) Top N + metrics + groupBy
  if (topN && metricLabel && groupByLabel) {
    return `Top ${topN} ${metricLabel} 按 ${groupByLabel}`;
  }
  // 2) metrics + groupBy
  if (metricLabel && groupByLabel) {
    return `${metricLabel} 按 ${groupByLabel}`;
  }
  // 1') topN + groupBy
  if (topN && groupByLabel) {
    return `Top ${topN} 按 ${groupByLabel}`;
  }
  // 3) table
  if (typeof a.table === "string" && a.table) {
    return a.table;
  }
  // 4) 兜底
  return argSummary(args);
}

/**
 * [本次重构] QueryDataCard — 单卡片渲染 query_details 工具结果。
 * 结构:
 *   1. 暖米色 header 条(工具图标 + "调用工具:" + 工具名 mono 绿 + 中文描述短语)
 *   2. SQL <pre>(关键字高亮)
 *   3. footer 两个 chip:绿色"返回 N 行" + 琥珀色"耗时 Nms"
 *   4. 查询结果表格(比率列自动按严重程度着色)
 *
 * 字段缺失时优雅降级:无 sql → 不渲染 <pre>;无 rowCount → 仍用 rows.length;无 rows → 占位"暂无数据"。
 */
const MONO_FONT =
  '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace';

/** chip 小图标 — 10px 通用行内 SVG */
function ChipIcon({
  d,
  size = 10,
}: {
  d: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

function StatusChip({
  bg,
  fg,
  icon,
  children,
}: {
  bg: string;
  fg: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: bg, color: fg }}
    >
      {icon}
      {children}
    </span>
  );
}

function QueryDataCard({
  res,
  args,
}: {
  res: ToolResultData;
  args?: Record<string, unknown>;
}) {
  const r = (res.result ?? {}) as Record<string, unknown>;
  const sql = typeof r.sql === "string" && r.sql.length > 0 ? r.sql : null;
  const rows = (Array.isArray(r.rows) ? r.rows : []) as Array<
    Record<string, unknown>
  >;
  const rowCount =
    typeof r.rowCount === "number"
      ? r.rowCount
      : typeof r.totalRows === "number"
        ? r.totalRows
        : null;
  const durationMs = typeof r.durationMs === "number" ? r.durationMs : null;
  const fieldMapping = r.fieldMapping as Record<string, string> | undefined;
  const metricLabels = r.metricLabels as
    | Record<string, string>
    | undefined;
  const showFooter = rowCount !== null || durationMs !== null;
  const displayedRows = rowCount ?? rows.length;
  const description = describeArgs(args);

  const toolMeta = TOOL_META[res.name];
  const toolColor = toolMeta?.color ?? "var(--green)";

  return (
    <div
      className="overflow-hidden rounded-lg border bg-muted border-default"
    >
      {/* Header: 暖米色条 + 工具图标 + "调用工具:" + mono 绿工具名 + 中文描述 */}
      <div
        className="flex items-center gap-2 border-b px-3 py-2 text-sm bg-amber-light border-default text-secondary"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke={toolColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
        </svg>
        <span className="whitespace-nowrap">调用工具:</span>
        <span
          className="whitespace-nowrap font-semibold font-mono-custom text-green"
        >
          {res.name}
        </span>
        {description && (
          <span
            className="min-w-0 flex-1 truncate text-xs text-muted"
            title={description}
          >
            · {description}
          </span>
        )}
      </div>

      {/* SQL 块 + footer 同一容器 */}
      {sql && (
        <div className="mx-3 mb-3 mt-3 overflow-hidden rounded">
          <pre
            className="overflow-x-auto p-3 pb-1 text-xs leading-relaxed font-mono-custom bg-hover-custom text-secondary whitespace-pre-wrap break-words m-0"
          >
            {highlightSql(sql)}
          </pre>
          {showFooter && (
            <div
              className="flex justify-end gap-2 px-3 py-1.5 text-[11px] bg-hover-custom border-t border-default"
            >
              {rowCount !== null && (
                <StatusChip
                  bg="var(--sev-good-bg)"
                  fg="var(--sev-good-fg)"
                  icon={<ChipIcon d="M3 12h18M3 6h18M3 18h12" />}
                >
                  返回 {displayedRows} 行
                </StatusChip>
              )}
              {durationMs !== null && (
                <StatusChip
                  bg="var(--sev-warn-bg)"
                  fg="var(--sev-warn-fg)"
                  icon={
                    <ChipIcon d="M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                  }
                >
                  耗时 {durationMs}ms
                </StatusChip>
              )}
            </div>
          )}
        </div>
      )}
      {/* SQL 缺失但仍有 footer:独立显示一行,样式与上面一致 */}
      {!sql && showFooter && (
        <div
          className="mx-3 mb-3 mt-3 flex justify-end gap-2 px-3 py-1.5 text-[11px]"
        >
          {rowCount !== null && (
            <StatusChip
              bg="var(--sev-good-bg)"
              fg="var(--sev-good-fg)"
              icon={<ChipIcon d="M3 12h18M3 6h18M3 18h12" />}
            >
              返回 {displayedRows} 行
            </StatusChip>
          )}
          {durationMs !== null && (
            <StatusChip
              bg="var(--sev-warn-bg)"
              fg="var(--sev-warn-fg)"
              icon={
                <ChipIcon d="M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
              }
            >
              耗时 {durationMs}ms
            </StatusChip>
          )}
        </div>
      )}

      {/* 表格区 */}
      {rows.length > 0 ? (
        <div className="px-3 pb-3">
          <CollapsibleTable
            rows={rows}
            fieldMapping={fieldMapping}
            metricLabels={metricLabels}
          />
        </div>
      ) : (
        <div
          className="px-3 pb-3 pt-1 text-center text-xs text-muted"
        >
          暂无数据
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
      className="mt-3 flex flex-wrap gap-2 border-t pt-3 border-default"
    >
      {suggestions.map((s, idx) => (
        <button
          key={idx}
          onClick={() => onSend(s.query)}
          className="rounded-full px-3 py-1 text-xs transition-colors bg-hover-custom text-secondary border border-default"
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
