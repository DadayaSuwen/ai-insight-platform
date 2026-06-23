import { useState } from 'react';
import DynamicChart from './DynamicChart';
import DataTable from './DataTable';
import MarkdownRenderer from './MarkdownRenderer';
import type { ChatMessage } from '../types';
import { isAssistant } from '../types';
import type { SSESQLData } from '@workspace/types';

interface MessageBubbleProps {
  message: ChatMessage;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/** User avatar — accent circle */
function UserAvatar() {
  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white shadow-sm"
      style={{ background: 'var(--accent)' }}
    >
      ME
    </div>
  );
}

/** Bot avatar — subtle card with accent icon */
function BotAvatar() {
  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-sm"
      style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        style={{ color: 'var(--accent)' }}
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    </div>
  );
}

/**
 * MessageBubble — enterprise chat renderer.
 *
 * Layout:
 * - User: right-aligned flex row, avatar at right end
 * - Assistant: CSS grid [avatar-fixed | content-fluid], blocks go full width
 */
function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end msg-enter">
        <div className="flex max-w-[85%] items-end gap-2">
          <span className="mb-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {formatTime(message.createdAt)}
          </span>
          <div
            className="rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed shadow-md"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            {message.content}
          </div>
          <UserAvatar />
        </div>
      </div>
    );
  }

  if (!isAssistant(message)) return null;

  const hasStreamingCursor =
    !message.isFinal && !message.error && !message.content;

  return (
    /* CSS grid: 44px avatar column + auto-width content column */
    <div className="grid grid-cols-[44px_auto] gap-3 msg-enter items-start">
      {/* ── Avatar column ─────────────────────────── */}
      <BotAvatar />

      {/* ── Content column ─────────────────────────── */}
      <div className="flex flex-col gap-2">

        {/* Label row */}
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] font-semibold"
            style={{ color: 'var(--accent)' }}
          >
            AI 助手
          </span>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {formatTime(message.createdAt)}
          </span>
        </div>

        {/* ── Text block ─────────────────────────── */}
        {/* ── Text block ─────────────────────────── */}
        {message.content ? (
          <AssistantCard>
            <div
              className="px-4 py-3 text-sm leading-relaxed"
              style={{ color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
            >
              {message.content}
              {!message.isFinal && !message.error && (
                <span className="streaming-cursor" />
              )}
            </div>
          </AssistantCard>
        ) : hasStreamingCursor ? (
          <AssistantCard>
            <div className="flex items-center gap-1.5 px-4 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>
              <span>正在思考</span>
              <span className="thinking-dots">
                <span />
                <span />
                <span />
              </span>
            </div>
          </AssistantCard>
        ) : null}

        {/* ── Error block ────────────────────────── */}
        {message.error && (
          <AssistantCard style={{ borderColor: 'var(--error)', background: 'var(--error-light)' }}>
            <div className="flex items-start gap-2.5 px-4 py-3">
              <svg
                width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className="mt-0.5 shrink-0" style={{ color: 'var(--error)' }}
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div>
                <div className="mb-0.5 text-xs font-semibold" style={{ color: 'var(--error)' }}>
                  {message.error.code ? `[${message.error.code}] ` : ''}出错了
                </div>
                <div className="text-xs" style={{ color: 'var(--error)', opacity: 0.8 }}>
                  {message.error.message}
                </div>
              </div>
            </div>
          </AssistantCard>
        )}

        {/* ── SQL block ─────────────────────────── */}
        {message.sql && (
          <SqlBlock
            sql={message.sql.sql}
            executed={message.sql.executed}
            rows={message.sql.rows}
          />
        )}

        {/* ── Chart block ──────────────────────── */}
        {message.chart && <DynamicChart chart={message.chart} />}

        {/* ── Analysis block ──────────────────── */}
        {message.analysis && (
          <AssistantCard style={{ borderColor: 'var(--warning)' }}>
            <div className="flex items-start gap-2.5 px-4 py-3">
              <svg
                width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className="mt-0.5 shrink-0" style={{ color: 'var(--warning)' }}
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <div className="flex-1 min-w-0">
                <div className="mb-2 text-xs font-semibold" style={{ color: 'var(--warning)' }}>
                  分析报告
                </div>
                <MarkdownRenderer content={message.analysis} />
              </div>
            </div>
          </AssistantCard>
        )}

        {/* ── Pending ─────────────────────────── */}
        {message.isFinal && !message.content && !message.error && !message.sql && !message.chart && !message.analysis && (
          <AssistantCard>
            <div className="px-4 py-3 text-sm italic" style={{ color: 'var(--text-muted)' }}>
              已收到你的问题，正在处理…
            </div>
          </AssistantCard>
        )}
      </div>
    </div>
  );
}

/* ── Assistant message card wrapper ───────────────────── */
function AssistantCard({
  children,
  className = '',
  style = {},
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl border ${className}`}
      style={{
        borderColor: 'var(--border)',
        background: 'var(--bg-primary)',
        boxShadow: 'var(--shadow-sm)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ── SQL collapsible block ───────────────────────────── */
function SqlBlock({
  sql,
  executed,
  rows,
}: {
  sql: string;
  executed: boolean;
  rows?: SSESQLData['rows'];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
    >
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between px-4 py-2.5 text-left transition-colors w-full"
        style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
      >
        <span className="flex items-center gap-2 font-mono text-xs">
          {executed ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--success)' }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span style={{ color: 'var(--success)' }}>已执行 SQL</span>
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)' }}>
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              <span>生成的 SQL</span>
            </>
          )}
        </span>
        <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {open ? '收起' : '展开'}
          <svg
            width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            style={{
              color: 'var(--text-muted)',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s ease',
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {open && (
        <>
          <pre
            className="overflow-x-auto px-4 py-3 font-mono text-xs leading-relaxed"
            style={{
              background: 'var(--bg-secondary)',
              color: 'var(--accent)',
              borderTop: '1px solid var(--border)',
              borderBottom: rows?.length ? '1px solid var(--border)' : 'none',
            }}
          >
            <code>{sql}</code>
          </pre>
          {rows && rows.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border)' }}>
              <DataTable rows={rows} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default MessageBubble;
