import React from "react";
import ReactMarkdown from "react-markdown";
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
function MessageBubble({ message }: { message: ChatMessage }) {
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
        {/* (A) 工具调用状态时间线 */}
        {(msg.toolCalls?.length ?? 0) > 0 && (
          <div
            className="mb-3 space-y-2 border-b pb-3"
            style={{ borderColor: "var(--border)" }}
          >
            {msg.toolCalls!.map((call, idx) => {
              const hasResult = (msg.toolResults?.length ?? 0) > idx;
              return (
                <div
                  key={idx}
                  className="flex items-center gap-2 text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  {hasResult ? (
                    <span style={{ color: "var(--success)" }}>✓</span>
                  ) : (
                    <span className="animate-pulse">⏳</span>
                  )}
                  <span>
                    {hasResult ? "已完成" : "正在执行"}：{call.name}
                  </span>
                </div>
              );
            })}
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
                  <div
                    key={idx}
                    className="overflow-x-auto rounded-lg border"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <table className="w-full text-xs">
                      <thead style={{ background: "var(--bg-hover)" }}>
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">
                            类别/地区
                          </th>
                          <th className="px-3 py-2 text-right font-medium">
                            销售额 (¥)
                          </th>
                          <th className="px-3 py-2 text-right font-medium">
                            销量
                          </th>
                          <th className="px-3 py-2 text-right font-medium">
                            订单数
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(
                          res.result.summary as Array<{
                            key: string;
                            totalAmount: number;
                            totalQuantity: number;
                            orderCount: number;
                          }>
                        ).map((row, ridx) => (
                          <tr
                            key={ridx}
                            className="border-t"
                            style={{ borderColor: "var(--border)" }}
                          >
                            <td className="px-3 py-2">{row.key}</td>
                            <td className="px-3 py-2 text-right">
                              {row.totalAmount}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {row.totalQuantity}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {row.orderCount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
            <ReactMarkdown>
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
      </div>
    </div>
  );
}

export default MessageBubble;
