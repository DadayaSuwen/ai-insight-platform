/**
 * [Fix-10 Task 10.2] 对话追问页 — 接入真实 SSE
 *
 * 删除 Fix-7 mock 硬编码对话
 * 改用 useSSEChat + useChatActions + useChatStore
 *
 * 三栏布局:
 *   左 240px: 推荐提问
 *   中 flex-1: 真实 SSE 对话流
 *   右 280px: 上下文面板 (实时 tool_calls / token / 耗时)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useDatasourceStore } from "../../../core/store/datasource-store";
import {
  getDatasourceSchema,
  type SchemaUnderstanding,
} from "../../schema-review/api";
import { useChatStore } from "../store";
import { useChatActions } from "../hooks/useChatActions";
import { useSSEChat } from "../hooks";
import { isAssistant, type ToolCallData, type ToolResultData } from "../types";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";
import {
  SessionSidebar,
  CollapsedSidebar,
  MobileSidebarDrawer,
  SidebarToggle,
} from "./sidebar";

/* ─── 推荐提问 (兜底) ─── */
const FALLBACK_SUGGESTIONS = [
  "本月销售额 Top 5 商品是哪些？",
  "各渠道订单分布如何？",
  "近 6 个月销售趋势怎么样？",
  "哪些客户消费最高？",
  "退货率最高的商品是哪些？",
];

/**
 * 根据已确认的 Schema 动态生成推荐提问。
 * 命中规则按优先级累加，凑满 5 条；不足则用 FALLBACK_SUGGESTIONS 兜底。
 */
function generateSuggestions(schema: SchemaUnderstanding | null): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (q: string) => {
    if (out.length < 5 && !seen.has(q)) {
      out.push(q);
      seen.add(q);
    }
  };
  if (!schema || schema.tables.length === 0) return [...FALLBACK_SUGGESTIONS];

  const allCols = schema.tables.flatMap((t) => t.columns);
  const orderish = schema.tables.find((t) => /订单|order/i.test(t.name));
  const productish = schema.tables.find((t) =>
    /商品|产品|product|item/i.test(t.name),
  );
  const customerish = schema.tables.find((t) =>
    /客户|customer|member/i.test(t.name),
  );
  const refundish = schema.tables.find((t) => /退|refund|return/i.test(t.name));
  const dateCol = allCols.find(
    (c) =>
      /date|time|created|at$/i.test(c.name) ||
      /日期|时间/.test(c.chineseName ?? ""),
  );
  const metricCol = allCols.find(
    (c) =>
      c.semanticRole === "metric" ||
      /金额|数量|amt|amount|qty|price|销售额/i.test(c.chineseName ?? c.name),
  );
  const channelCol = allCols.find(
    (c) =>
      /渠道|channel|source/i.test(c.name) ||
      /渠道|来源/.test(c.chineseName ?? ""),
  );

  // 规则 1：订单 + metric + date → "本月 Top N" + "近 6 个月趋势"
  if (orderish && metricCol && dateCol) {
    push(`本月销售额 Top 5 的${orderish.name}是哪些？`);
    push(`近 6 个月${metricCol.chineseName ?? metricCol.name}趋势怎么样？`);
  }
  // 规则 2：订单 + 渠道 → 渠道分布
  if (orderish && channelCol) {
    push(
      `各${channelCol.chineseName ?? channelCol.name}${orderish.name}分布如何？`,
    );
  }
  // 规则 3：客户表 → 客户消费排名
  if (customerish && orderish && metricCol) {
    push(`哪些${customerish.name}消费最高？`);
  }
  // 规则 4：退货相关 → 退货率
  if (
    refundish ||
    allCols.some((c) => /退|退货|refund/i.test(c.chineseName ?? ""))
  ) {
    push(`退货率最高的${productish?.name ?? "商品"}是哪些？`);
  }
  // 规则 5：商品 + metric → 商品排行
  if (productish && metricCol) {
    push(
      `${productish.name}中${metricCol.chineseName ?? metricCol.name}最高的 5 个是哪些？`,
    );
  }

  // 兜底：用静态池补到 5 条，且不重复
  for (const fb of FALLBACK_SUGGESTIONS) {
    if (out.length >= 5) break;
    push(fb);
  }
  return out.slice(0, 5);
}

export default function ChatWindow() {
  const { datasourceId } = useParams<{ datasourceId: string }>();
  const navigate = useNavigate();
  const urlDsId = useDatasourceStore((s) => s.currentDatasourceId);
  const dsId = datasourceId || urlDsId || "";

  // [Bug-1] 同步 URL 的 datasourceId 到 chat store, 否则后端收不到数据源
  useEffect(() => {
    if (dsId && dsId !== "mock") {
      useChatStore.getState().setSelectedDataSourceId(dsId);
    }
  }, [dsId]);

  // 差距 1+2 — 拉取已确认的 Schema understanding 用于左栏和 header 统计
  const [schema, setSchema] = useState<SchemaUnderstanding | null>(null);
  useEffect(() => {
    if (!dsId || dsId === "mock") {
      setSchema(null);
      return;
    }
    let cancelled = false;
    getDatasourceSchema(dsId)
      .then((res) => {
        if (!cancelled) setSchema(res.schemaUnderstanding);
      })
      .catch(() => {
        if (!cancelled) setSchema(null);
      });
    return () => {
      cancelled = true;
    };
  }, [dsId]);

  // 差距 4 — 读后端真实 token + 耗时(chat-system-architecture.md §六原则 4)
  // 不再客户端估算,所有数据由后端 ChatService 在 done 事件的 stats 字段下发。
  const [lastStats, setLastStats] = useState<{
    elapsedMs?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  } | null>(null);

  const messages = useChatStore((s) => s.messages);
  const sidebarCollapsed = useChatStore((s) => s.sidebarCollapsed);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { sendInCurrentSession, loadSessions, selectSession } =
    useChatActions();

  const { sendMessage, isLoading, error, abort } = useSSEChat({
    onText: (data) => {
      useChatStore.getState().updateLastAssistant((msg) => ({
        ...msg,
        content: msg.content + data.content,
      }));
    },
    onToolCall: (data) => {
      useChatStore.getState().updateLastAssistant((msg) => ({
        ...msg,
        toolCalls: [...(msg.toolCalls ?? []), data],
      }));
    },
    onToolResult: (data) => {
      useChatStore.getState().updateLastAssistant((msg) => ({
        ...msg,
        toolResults: [...(msg.toolResults ?? []), data],
      }));
    },
    onError: (data) => {
      useChatStore.getState().updateLastAssistant((msg) => ({
        ...msg,
        error: { code: data.code, message: data.message },
      }));
    },
    onDone: (data) => {
      // 后端在最终 done 事件下发 stats(可能 undefined — Anthropic 流式不发 usage)
      if (data?.stats) {
        setLastStats(data.stats);
      }
      useChatStore.getState().updateLastAssistant((msg) => ({
        ...msg,
        isFinal: true,
      }));
    },
  });

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // [Fix] 进入对话页时加载历史会话，恢复最近会话的消息
  useEffect(() => {
    let cancelled = false;
    loadSessions().then(() => {
      if (cancelled) return;
      const cur = useChatStore.getState().currentSessionId;
      if (cur) {
        selectSession(cur, { abort });
      }
    });
    return () => {
      cancelled = true;
    };
    // 仅在挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = async (text: string) => {
    if (!text.trim() || isLoading) return;
    await sendInCurrentSession(text, {
      sendMessage,
      abort,
      newId: () => crypto.randomUUID(),
    });
  };

  const lastAssistant = [...messages].reverse().find(isAssistant);
  const lastToolCalls: ToolCallData[] = lastAssistant?.toolCalls ?? [];
  const lastToolResults: ToolResultData[] = lastAssistant?.toolResults ?? [];

  // 差距 6 — 根据 schema 动态生成推荐提问;schema 未到则用 FALLBACK
  const suggestions = useMemo(() => generateSuggestions(schema), [schema]);

  return (
    <div className="flex flex-1 h-full overflow-hidden">
      {/* 左侧 - 会话历史侧边栏 */}
      {sidebarCollapsed ? <CollapsedSidebar /> : <SessionSidebar />}
      <MobileSidebarDrawer />
      <SidebarToggle />

      {/* 中间 - 对话主区 (minHeight:0 防止 flex row 子元素随内容撑高,确保内部滚动条生效) */}
      <main className="flex-1 flex flex-col min-w-0 min-h-[0] bg-surface">
        {/* 顶栏 */}
        <div className="py-3 px-4 border-b border-light flex items-center gap-2 shrink-0">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate(`/dashboard/${dsId}`)}
            title="返回工作台"
          >
            <ArrowLeft size={14} />
            返回工作台
          </button>
          <span className="badge badge-success">● Schema 已确认</span>
          {/* 差距 2 — Schema 统计信息 */}
          {schema && (
            <span className="text-xs text-muted">
              基于 {schema.tables.length} 张表 ·{" "}
              {schema.tables.reduce((sum, t) => sum + t.columns.length, 0)} 字段
              · {schema.relations?.length ?? 0} 关系
            </span>
          )}
        </div>

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto py-5 px-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted gap-3">
              <div className="text-4xl">💬</div>
              <p className="text-[15px] font-semibold">
                基于已确认的 Schema，问任何问题
              </p>
              <p className="text-sm">
                Agent 会调用 SQL 查询、生成图表并给出分析建议
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                onSuggestionClick={handleSend}
              />
            ))
          )}
          {error && (
            <div className="py-2.5 px-3.5 my-2 bg-error-light border-l-[3px] border-l-red-500 rounded-md text-xs text-error">
              {error}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 推荐提问 — 仅在空对话时显示在输入框上方 */}
        {messages.length === 0 && suggestions.length > 0 && (
          <div
            className="px-6 py-3 border-t border-light shrink-0"
            style={{ background: "var(--bg-secondary)" }}
          >
            <div className="text-xs text-muted mb-2">
              💡 推荐提问（基于当前 Schema）
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((q, i) => (
                <button
                  key={i}
                  className="px-3 py-1.5 rounded-full border text-xs text-default transition-colors disabled:opacity-50"
                  style={{
                    background: "var(--bg-primary)",
                    borderColor: "var(--border)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--green)";
                    e.currentTarget.style.background = "var(--green-lighter)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border)";
                    e.currentTarget.style.background = "var(--bg-primary)";
                  }}
                  onClick={() => handleSend(q)}
                  disabled={isLoading}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 输入区 */}
        <ChatInput onSend={handleSend} onStop={abort} isLoading={isLoading} />
      </main>

      {/* 右侧 - 上下文面板 */}
      <aside className="w-[280px] shrink-0 border-l border-light bg-muted p-4 overflow-y-auto text-xs">
        <div className="context-section mb-4">
          <h3>使用工具</h3>
          {lastToolCalls.length === 0 ? (
            <div className="text-xs text-muted">
              {isLoading ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 border-2 border-muted border-t-green rounded-full animate-spin" />
                  思考中...
                </span>
              ) : (
                "等待工具调用..."
              )}
            </div>
          ) : (
            <ul className="m-0 pl-4 text-xs">
              {lastToolCalls.map((tc: ToolCallData, i: number) => (
                <li key={i} className="text-secondary mb-1">
                  <code className="font-mono text-xs">{tc.name}</code>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="context-section mb-4">
          <h3>🗄️ 可用表 · {schema?.tables.length ?? 0} 张</h3>
          {schema && schema.tables.length > 0 ? (
            <ul className="m-0 p-0 list-none">
              {schema.tables.map((t) => (
                <li key={t.name} className="text-xs text-secondary mb-1.5">
                  <code className="font-mono text-[11px] text-default">
                    {t.name}
                  </code>
                  <span className="text-muted ml-1.5">
                    {t.columns.length} 字段
                    {t.rowCount != null && (
                      <> · {t.rowCount.toLocaleString()} 行</>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-xs text-muted">加载中…</div>
          )}
        </div>

        <div className="context-section mb-4">
          <h3>本轮工具结果</h3>
          {lastToolResults.length === 0 ? (
            <div className="text-xs text-muted">暂无</div>
          ) : (
            <div className="text-xs text-secondary">
              {lastToolResults.length} 个结果
              <ul className="mt-1 pl-4">
                {lastToolResults.map((tr: ToolResultData, i: number) => (
                  <li key={i} className="mb-0.5">
                    <code className="font-mono text-[10px]">{tr.name}</code>
                    {tr.result?.rowCount !== undefined && (
                      <span className="text-muted ml-1.5">
                        {tr.result.rowCount as number} 行
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* 差距 4 — Token 消耗 (后端真实 stats) */}
        <div className="context-section mb-4">
          <h3>📊 Token 消耗</h3>
          {lastStats ? (
            <div className="text-xs text-secondary leading-relaxed">
              <div className="flex justify-between">
                <span>输入 tokens</span>
                <span className="font-mono">
                  {lastStats.inputTokens?.toLocaleString() ?? "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>输出 tokens</span>
                <span className="font-mono">
                  {lastStats.outputTokens?.toLocaleString() ?? "—"}
                </span>
              </div>
              <div className="flex justify-between pt-1 border-t border-light mt-1">
                <span className="font-semibold">合计</span>
                <span className="font-mono text-green font-semibold">
                  {lastStats.totalTokens?.toLocaleString() ?? "—"}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted">—</div>
          )}
        </div>

        {/* 差距 4 — 耗时 (后端真实 elapsedMs) */}
        <div className="context-section">
          <h3>⏱️ 耗时</h3>
          <div className="text-xs text-secondary font-mono">
            {lastStats?.elapsedMs != null
              ? `${(lastStats.elapsedMs / 1000).toFixed(1)}s`
              : "—"}
          </div>
        </div>
      </aside>
    </div>
  );
}
