import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm"; // ★ 引入插件
import DynamicChart from "./DynamicChart";
import type { ChatMessage, AssistantMessage } from "../types";

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

        {/* (B) 工具返回的结果 (图表 / 表格) */}
        {(msg.toolResults?.length ?? 0) > 0 && (
          <div className="mb-3 space-y-4">
            {msg.toolResults!.map((res, idx) => {
              if (res.name === "gen_chart" && res.result.chart) {
                return (
                  <div
                    key={idx}
                    className="rounded-lg p-2"
                    style={{ background: "var(--bg-secondary)" }}
                  >
                    <DynamicChart
                      option={res.result.chart as Record<string, unknown>}
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
              return null;
            })}
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
import { useState } from "react";

// 通用的可折叠数据表格组件 (完全动态)
function CollapsibleTable({ rows }: { rows: Record<string, any>[] }) {
  const [expanded, setExpanded] = useState(false);

  if (!rows || rows.length === 0) return null;

  // 1. 动态提取表头 (取第一行数据的所有 key)
  const headers = Object.keys(rows[0]);

  // 2. 表头友好映射 (把英文 key 转成中文展示)
  const headerMap: Record<string, string> = {
    key: "分组/时间",
    name: "名称",
    totalAmount: "销售额 (¥)",
    totalQuantity: "销量",
    orderCount: "订单数",
    value: "数值",
    // 未来如果有新字段，只需在这里加映射即可，或者直接显示英文
  };

  return (
    <div className="relative mt-2">
      <div
        className="overflow-auto rounded-lg border transition-all"
        style={{
          borderColor: "var(--border)",
          maxHeight: expanded ? "none" : "200px",
        }}
      >
        <table className="w-full text-xs">
          <thead
            style={{ background: "var(--bg-hover)" }}
            className="sticky top-0"
          >
            <tr>
              {headers.map((h) => (
                <th
                  key={h}
                  className="px-3 py-2 text-left font-medium whitespace-nowrap"
                >
                  {headerMap[h] || h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ridx) => (
              <tr
                key={ridx}
                className="border-t"
                style={{ borderColor: "var(--border)" }}
              >
                {headers.map((h) => {
                  const val = row[h];

                  // ★ 健壮的数字判断：支持原生 number 和纯数字字符串
                  const isNum =
                    (typeof val === "number" && !isNaN(val)) ||
                    (typeof val === "string" &&
                      val.trim() !== "" &&
                      !isNaN(Number(val)));

                  return (
                    <td
                      key={h}
                      className={`px-3 py-2 whitespace-nowrap tabular-nums text-left`}
                    >
                      {/* 如果是数字，格式化为千分位；否则直接显示字符串 */}
                      {isNum
                        ? Number(val).toLocaleString()
                        : String(val ?? "-")}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > 8 && (
        <div
          className="flex justify-center py-1.5 border-t"
          style={{
            borderColor: "var(--border)",
            background: "var(--bg-primary)",
          }}
        >
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-medium hover:underline"
            style={{ color: "var(--accent)" }}
          >
            {expanded ? "⬆ 收起表格" : `⬇ 展开全部 (${rows.length} 行)`}
          </button>
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
  const hasTable = message.toolResults?.some((r) => r.name === "query_sales");

  // 根据上一轮的结果，推荐不同的下一步动作
  if (hasChart && !hasTable) {
    suggestions.push({
      label: "📋 查看明细数据",
      query: "把刚才的数据用表格详细列出来",
    });
    suggestions.push({
      label: "🔍 深挖最大值",
      query: "找出刚才数据中销售额最高的那个，深入分析一下它的构成",
    });
  } else if (hasTable && !hasChart) {
    suggestions.push({
      label: "📊 生成可视化图表",
      query: "把刚才的数据画成图表展示",
    });
    suggestions.push({
      label: "📉 查看时间趋势",
      query: "看一下这些数据近期的变化趋势",
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
