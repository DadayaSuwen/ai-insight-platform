import { useRef, useEffect, useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, PanelLeft } from "lucide-react";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";
import { useChatStore } from "../store";
import { useSSEChat } from "../hooks";
import { useDatasourceStore } from "../../../core/store/datasource-store";
import { useChatActions } from "../hooks/useChatActions";
import { chatSessionApi } from "../api";
import { recordToChatMessage } from "../utils/recordToChatMessage";
import DataSourcePicker from "../../datasources/DataSourcePicker";
import {
  saveCurrentSessionId,
  saveSessions,
  saveSidebarOpen,
  saveSidebarCollapsed,
} from "../store/persistence";
import {
  SessionSidebar,
  CollapsedSidebar,
  MobileSidebarDrawer,
  SidebarToggle,
} from "./sidebar";
import WelcomeScreen from "./WelcomeScreen";
import type {
  ChatMessage,
  AssistantMessage,
  ToolCallData,
  ToolResultData,
} from "../types";

import type { ChatSession } from "../../../types/chat";

function newId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

/** Preset quick-command chips shown in the empty state and below the header */
const QUICK_COMMANDS = [
  {
    label: "本月销售总览",
    icon: "📊",
    query: "帮我统计本月的总销售额、订单量和销量，并给出一个概览。",
  },
  {
    label: "各品类业绩对比",
    icon: "📈",
    query:
      "对比各类别商品今年的销售额和利润，画出柱状图，并分析哪个品类表现最好。",
  },
  {
    label: "年度销售趋势",
    icon: "📉",
    query: "分析今年每个月的销售趋势，画出折线图，找出销售额最高和最低的月份。",
  },
  {
    label: "客户画像洞察",
    icon: "👥",
    query: "对比不同客户类型在购买品类上的偏好差异，并给出商业建议。",
  },
  {
    label: "地区利润分析",
    icon: "🗺️",
    query: "分析各个地区的利润表现，哪些地区亏损较多？",
  },
  {
    label: "爆款商品盘点",
    icon: "🔥",
    query: "查一下今年销量最高的前 5 个商品，以及它们的总销售额。",
  },
];

/** Simulated connection health — in production this would ping /database/schema */
function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span className="relative flex h-2 w-2">
      {connected && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
      )}
      <span
        className={`relative inline-flex h-2 w-2 rounded-full ${
          connected ? "bg-green-500" : "bg-red-500"
        }`}
      />
    </span>
  );
}

/**
 * ChatWindow — enterprise chat surface with multi-session sidebar.
 */
function ChatWindow() {
  const messages = useChatStore((s) => s.messages);
  const updateLastAssistant = useChatStore((s) => s.updateLastAssistant);
  const upsertSession = useChatStore((s) => s.upsertSession);
  const theme = useChatStore((s) => s.theme);
  const toggleTheme = useChatStore((s) => s.toggleTheme);
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const sessions = useChatStore((s) => s.sessions);
  const sidebarOpen = useChatStore((s) => s.sidebarOpen);
  const sidebarCollapsed = useChatStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useChatStore((s) => s.setSidebarCollapsed);
  const historyLoading = useChatStore((s) => s.historyLoading);
  const navigate = useNavigate();
  const selectedDataSourceId = useChatStore((s) => s.selectedDataSourceId);
  const setSelectedDataSourceId = useChatStore((s) => s.setSelectedDataSourceId);
  // [Fix-5 Task 5.8] 从 URL :datasourceId 拿, 也读全局 datasourceStore 兜底
  const { datasourceId: urlDsId } = useParams<{ datasourceId: string }>();
  const storedDsId = useDatasourceStore((s) => s.currentDatasourceId);
  const datasourceId = (urlDsId || storedDsId || selectedDataSourceId || '');
  // URL 传入的 dsId 变化时, 同步到 chatStore 后续 useSSEChat 可读
  useEffect(() => {
    if (datasourceId && datasourceId !== selectedDataSourceId) {
      setSelectedDataSourceId(datasourceId);
    }
  }, [datasourceId, selectedDataSourceId, setSelectedDataSourceId]);
  const currentSession = currentSessionId
    ? sessions.find((s) => s.id === currentSessionId)
    : undefined;

  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const [connected] = useState(true);

  // ── 副作用封装 ──
  const { sendInCurrentSession, loadSessions, refreshSessions } =
    useChatActions();

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    isNearBottomRef.current = true;
  };

  useEffect(() => {
    if (isNearBottomRef.current) {
      scrollToBottom();
    }
  }, [messages]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom < 80;
  };

  // ─── SSE Event Handlers ────────────────────────────────────

  const onText = useCallback(
    (data: { content: string }) => {
      updateLastAssistant((msg) => ({
        ...msg,
        content: msg.content + data.content,
      }));
    },
    [updateLastAssistant],
  );

  const onToolCall = useCallback(
    (data: ToolCallData) => {
      updateLastAssistant((msg) => ({
        ...msg,
        toolCalls: [...(msg.toolCalls ?? []), data],
      }));
    },
    [updateLastAssistant],
  );

  const onToolResult = useCallback(
    (data: ToolResultData) => {
      updateLastAssistant((msg) => ({
        ...msg,
        toolResults: [...(msg.toolResults ?? []), data],
      }));
    },
    [updateLastAssistant],
  );

  const onError = useCallback(
    (data: { code: string; message: string }) => {
      updateLastAssistant((msg) => ({
        ...msg,
        error: { code: data.code, message: data.message },
      }));
    },
    [updateLastAssistant],
  );

  const onDone = useCallback(
    (data?: { session?: ChatSession | null }) => {
      updateLastAssistant((msg) => ({ ...msg, isFinal: true }));
      isNearBottomRef.current = true;
      scrollToBottom();
      // 优先用 done 事件携带的 session 局部更新（覆盖自动重命名 + touch updatedAt），
      // 省一次 GET /chat/sessions。仅当后端没回 session 时（catch 路径）才走兜底刷新。
      if (data?.session) {
        upsertSession(data.session);
      } else {
        void refreshSessions();
      }
    },
    [updateLastAssistant, upsertSession, refreshSessions],
  );

  const { sendMessage, isLoading, error, abort } = useSSEChat({
    onText,
    onToolCall,
    onToolResult,
    onError,
    onDone,
  });

  // ─── Effects: 初始加载 + 持久化 ───────────────────────────

  // 首次挂载：拉取会话列表；如果存在 currentSessionId 则恢复其历史
  useEffect(() => {
    void (async () => {
      await loadSessions();
      const id = useChatStore.getState().currentSessionId;
      if (id) {
        try {
          const records = await chatSessionApi.messages(id);
          const msgs: ChatMessage[] = records.map(recordToChatMessage);
          useChatStore.getState().setMessages(msgs);
        } catch (err) {
          console.error("[ChatWindow] restore session failed", err);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 持久化 currentSessionId
  useEffect(() => {
    saveCurrentSessionId(currentSessionId);
  }, [currentSessionId]);

  // 持久化 sessions（200ms debounce）
  useEffect(() => {
    const t = setTimeout(() => saveSessions(sessions), 200);
    return () => clearTimeout(t);
  }, [sessions]);

  // 持久化 sidebarOpen
  useEffect(() => {
    saveSidebarOpen(sidebarOpen);
  }, [sidebarOpen]);

  // 持久化 sidebarCollapsed
  useEffect(() => {
    saveSidebarCollapsed(sidebarCollapsed);
  }, [sidebarCollapsed]);

  // ─── User Actions ───────────────────────────────────────────

  // [Sprint 5.7+] 编辑消息：将文本填入输入框
  const [editText, setEditText] = useState("");

  const handleSend = useCallback(
    async (text: string) => {
      setEditText(""); // 发送后清空编辑文本
      await sendInCurrentSession(text, { sendMessage, abort, newId });
    },
    [sendInCurrentSession, sendMessage, abort],
  );

  // [Sprint 5.7+] 重试：找到当前助手消息对应的用户问题并重新发送
  const handleRetry = useCallback(
    (assistantMsgId: string) => {
      const idx = messages.findIndex((m) => m.id === assistantMsgId);
      if (idx <= 0) return;
      // 向前找到最近的用户消息
      for (let i = idx - 1; i >= 0; i--) {
        if (messages[i].role === "user") {
          handleSend(messages[i].content);
          return;
        }
      }
    },
    [messages, handleSend],
  );

  const handleQuickCommand = (query: string) => {
    if (isLoading) return;
    handleSend(query);
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-full">
      {/* 移动端抽屉 (<md) */}
      <MobileSidebarDrawer />
      {/* 桌面侧栏 (md:) */}
      <div className="hidden md:block">
        {sidebarCollapsed ? <CollapsedSidebar /> : <SessionSidebar />}
      </div>

      <main className="flex h-full flex-1 flex-col">
        {/* ── Header ─────────────────────────────────── */}
        <header
          className="flex shrink-0 items-center justify-between border-b px-4 py-3"
          style={{
            background: "var(--bg-primary)",
            borderColor: "var(--border)",
          }}
        >
          <div className="flex items-center gap-2">
            {/* 移动端：打开抽屉 */}
            <SidebarToggle />
            {/* 桌面端：折叠状态时显示展开按钮 */}
            {sidebarCollapsed && (
              <button
                onClick={() => setSidebarCollapsed(false)}
                aria-label="展开侧边栏"
                title="展开侧边栏"
                className="hidden h-8 w-8 items-center justify-center rounded-md transition-colors md:flex"
                style={{ color: "var(--text-secondary)" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--bg-hover)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <PanelLeft size={16} />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <h1
                className="truncate text-sm font-semibold"
                style={{ color: "var(--text-primary)" }}
                title={currentSession?.title || "新对话"}
              >
                {currentSession?.title || "新对话"}
              </h1>
              <div
                className="flex items-center gap-1.5 text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                <StatusDot connected={connected} />
                <span>{connected ? "服务正常" : "服务中断"}</span>
                <span className="opacity-50">·</span>
                <span>Agent 架构已启用</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* [Sprint 3] 数据源徽标选择器 */}
            <DataSourcePicker
              value={selectedDataSourceId}
              onChange={id => setSelectedDataSourceId(id)}
            />

            {/* [Sprint 5] 用户信息 + 退出登录 */}
            <UserMenu />
            <button
              onClick={() => navigate("/settings")}
              className="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
              style={{ color: "var(--text-secondary)" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--bg-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
              title="LLM 设置"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>

            <button
              onClick={toggleTheme}
              className="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
              style={{ color: "var(--text-secondary)" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--bg-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
              title={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
            >
              {theme === "dark" ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="19.78" />
                </svg>
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
          </div>
        </header>

        {/* ── Quick Commands ──────────────────────── */}
        {isEmpty && (
          <div
            className="shrink-0 border-b px-6 py-3"
            style={{
              borderColor: "var(--border)",
              background: "var(--bg-primary)",
            }}
          >
            <div className="mx-auto max-w-5xl">
              <p
                className="mb-2.5 text-xs font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                快捷指令
              </p>
              <div className="flex flex-wrap gap-2">
                {QUICK_COMMANDS.map((cmd) => (
                  <button
                    key={cmd.query}
                    className="quick-chip"
                    onClick={() => handleQuickCommand(cmd.query)}
                    disabled={isLoading}
                  >
                    <span>{cmd.icon}</span>
                    <span>{cmd.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Messages / Welcome ─────────────────── */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="relative flex-1 overflow-y-auto"
          style={{ background: "var(--bg-secondary)" }}
        >
          {historyLoading && (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3"
              style={{
                background: "var(--bg-secondary)",
                color: "var(--text-muted)",
              }}
            >
              <Loader2
                className="animate-spin"
                size={22}
                style={{ color: "var(--accent)" }}
              />
              <div className="text-sm">正在加载历史对话…</div>
            </div>
          )}
          {isEmpty ? (
            <WelcomeScreen onSend={handleSend} isLoading={isLoading} />
          ) : (
            <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
            {messages.map((m) => (
              <div key={m.id} className="msg-enter">
                <MessageBubble
                  message={m}
                  onSuggestionClick={handleSend}
                  onRetry={m.role === "user" ? () => handleRetry(m.id) : undefined}
                  onEdit={m.role === "user" ? setEditText : undefined}
                />
              </div>
            ))}
            </div>
          )}
        </div>

        {/* ── Error banner ──────────────────────── */}
        {error && (
          <div
            className="flex items-center gap-2 border-t px-6 py-2 text-xs"
            style={{
              background: "var(--error-light)",
              borderColor: "var(--error)",
              color: "var(--error)",
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
            <button
              className="ml-auto underline"
              onClick={() => useChatStore.getState().clearMessages()}
            >
              清空并重试
            </button>
          </div>
        )}

        {/* ── Input ──────────────────────────────── */}
        {!isEmpty && (
          <ChatInput
            onSend={handleSend}
            onStop={abort}
            isLoading={isLoading}
            editText={editText}
          />
        )}
      </main>
    </div>
  );
}

export default ChatWindow;

/**
 * [Sprint 5] UserMenu — 显示当前用户邮箱 + 退出登录按钮
 *
 * 从 localStorage 读 user(由 LoginPage / RegisterPage 写入)。
 * 不在这里调用 /auth/me(那需要 token,改用 Axios 拦截器统一处理)。
 */
function UserMenu() {
  const [user, setUser] = useState<{ email: string } | null>(() => {
    try {
      const raw = localStorage.getItem('aiip.auth.user.v1');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const navigate = useNavigate();

  if (!user) return null;

  const handleLogout = () => {
    localStorage.removeItem('aiip.auth.token.v1');
    localStorage.removeItem('aiip.auth.user.v1');
    // 清空本地 store 中的 sessions,避免下次登录看到上个用户的会话
    try {
      localStorage.removeItem('aiip.chat.sessions.v1');
      localStorage.removeItem('aiip.chat.currentId.v1');
    } catch {
      // ignore
    }
    setUser(null);
    navigate('/login');
  };

  return (
    <div
      className="flex items-center gap-1 rounded-md border px-2 py-1 text-[10px]"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--bg-secondary)',
        color: 'var(--text-secondary)',
      }}
      title={user.email}
    >
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: 'var(--success)' }}
      />
      <span className="max-w-[100px] truncate">{user.email}</span>
      <button
        onClick={handleLogout}
        className="ml-1 underline"
        style={{ color: 'var(--text-muted)' }}
        title="退出登录"
      >
        退出
      </button>
    </div>
  );
}
