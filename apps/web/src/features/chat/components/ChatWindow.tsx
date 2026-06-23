import { useRef, useEffect, useCallback, useState } from 'react';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
import { useChatStore } from '../store';
import { useSSEChat } from '../hooks';
import type { ChatMessage, AssistantMessage } from '../types';
import type {
  SSETokenData,
  SSESQLData,
  SSEChartData,
  SSEAnalysisData,
  SSEErrorData,
} from '@workspace/types';

function newId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

/** Preset quick-command chips shown in the empty state and below the header */
const QUICK_COMMANDS = [
  { label: '按类目统计销售额', icon: '📊', query: '按类别显示销售额' },
  { label: '月度销售趋势', icon: '📈', query: '展示月度销售趋势' },
  { label: 'Top 5 客户', icon: '👑', query: '销量最高的5个客户' },
  { label: '地区分布', icon: '🗺️', query: '按地区统计销量分布' },
  { label: '同比分析', icon: '📉', query: '今年与去年同期的销售对比' },
  { label: '库存预警', icon: '⚠️', query: '哪些商品库存低于100' },
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
          connected ? 'bg-green-500' : 'bg-red-500'
        }`}
      />
    </span>
  );
}

/**
 * ChatWindow — enterprise chat surface.
 *
 * Wires ChatInput → useSSEChat → useChatStore.
 *
 * Streaming model: assistant messages are stored in the zustand store from
 * the moment a user sends. SSE events update the *last* assistant message
 * in place. When 'done' fires, we mark `isFinal = true`.
 */
function ChatWindow() {
  const messages = useChatStore((s) => s.messages);
  const addMessage = useChatStore((s) => s.addMessage);
  const updateLastAssistant = useChatStore((s) => s.updateLastAssistant);
  const theme = useChatStore((s) => s.theme);
  const toggleTheme = useChatStore((s) => s.toggleTheme);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [connected] = useState(true); // todo: wire to actual health-check

  // Auto-scroll to bottom on new content
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onToken = useCallback(
    (data: SSETokenData) => {
      updateLastAssistant((msg) => ({
        ...msg,
        content: msg.content + data.content,
      }));
    },
    [updateLastAssistant],
  );

  const onSQL = useCallback(
    (data: SSESQLData) => {
      updateLastAssistant((msg) => ({ ...msg, sql: data }));
    },
    [updateLastAssistant],
  );

  const onChart = useCallback(
    (data: SSEChartData) => {
      updateLastAssistant((msg) => ({ ...msg, chart: data }));
    },
    [updateLastAssistant],
  );

  const onAnalysis = useCallback(
    (data: SSEAnalysisData) => {
      updateLastAssistant((msg) => ({ ...msg, analysis: data.content }));
    },
    [updateLastAssistant],
  );

  const onError = useCallback(
    (data: SSEErrorData) => {
      updateLastAssistant((msg) => ({
        ...msg,
        error: { code: data.code, message: data.message },
      }));
    },
    [updateLastAssistant],
  );

  const onDone = useCallback(() => {
    updateLastAssistant((msg) => ({ ...msg, isFinal: true }));
  }, [updateLastAssistant]);

  const { sendMessage, isLoading, error } = useSSEChat({
    onToken,
    onSQL,
    onChart,
    onAnalysis,
    onError,
    onDone,
  });

  const handleSend = useCallback(
    (text: string) => {
      const userMsg: ChatMessage = {
        id: newId(),
        role: 'user',
        content: text,
        createdAt: new Date().toISOString(),
      };
      const draftAssistant: AssistantMessage = {
        id: newId(),
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
        isFinal: false,
      };
      addMessage(userMsg);
      addMessage(draftAssistant);
      sendMessage(text);
    },
    [addMessage, sendMessage],
  );

  const handleQuickCommand = (query: string) => {
    if (isLoading) return;
    handleSend(query);
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--bg-primary)' }}>
      {/* ── Header ─────────────────────────────────────────── */}
      <header
        className="flex shrink-0 items-center justify-between border-b px-4 py-3"
        style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-3">
          {/* Logo mark */}
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
            style={{ background: 'var(--accent)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              AI Insight Platform
            </h1>
            <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              <StatusDot connected={connected} />
              <span>{connected ? '服务正常' : '服务中断'}</span>
              <span className="opacity-50">·</span>
              <span>自然语言查询</span>
            </div>
          </div>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          {/* Clear chat */}
          {!isEmpty && (
            <button
              onClick={() => useChatStore.getState().clearMessages()}
              className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs transition-colors"
              style={{ color: 'var(--text-secondary)', background: 'transparent' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4h6v2" />
              </svg>
              清空会话
            </button>
          )}

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
          >
            {theme === 'dark' ? (
              /* Sun icon */
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              /* Moon icon */
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* ── Quick Commands (shown when empty) ──────────────── */}
      {isEmpty && (
        <div className="shrink-0 border-b px-4 py-4" style={{ borderColor: 'var(--border)' }}>
          <p className="mb-3 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
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
      )}

      {/* ── Messages ───────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        style={{ background: 'var(--bg-secondary)' }}
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4">
          {isEmpty && (
            <div
              className="flex flex-col items-center justify-center py-16 text-center"
              style={{ color: 'var(--text-muted)' }}
            >
              <div
                className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
                style={{ background: 'var(--bg-tertiary)' }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <p className="mb-1 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                开始对话
              </p>
              <p className="text-xs">
                输入自然语言问题，我将查询数据并生成可视化图表与分析报告
              </p>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className="msg-enter">
              <MessageBubble message={m} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Error banner ──────────────────────────────────── */}
      {error && (
        <div
          className="flex items-center gap-2 border-t px-4 py-2 text-xs"
          style={{ background: 'var(--error-light)', borderColor: 'var(--error)', color: 'var(--error)' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

      {/* ── Input ──────────────────────────────────────────── */}
      <ChatInput onSend={handleSend} isLoading={isLoading} />
    </div>
  );
}

export default ChatWindow;
