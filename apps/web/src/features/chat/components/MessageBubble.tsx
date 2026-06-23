import { useState } from 'react';
import DynamicChart from './DynamicChart';
import type { ChatMessage } from '../types';
import { isAssistant } from '../types';

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

/** Avatar initials */
function UserAvatar() {
  return (
    <div
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
      style={{ background: 'var(--accent)' }}
    >
      ME
    </div>
  );
}

function BotAvatar() {
  return (
    <div
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
      style={{ background: 'var(--bg-tertiary)' }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--accent)' }}>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    </div>
  );
}

/**
 * MessageBubble — render a single chat message.
 *
 * User: right-aligned with blue bubble + user avatar.
 * Assistant: left-aligned with bot avatar, optional SQL/chart/analysis/error blocks,
 *            and a blinking cursor while streaming.
 */
function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[75%] items-end gap-2">
          <span
            className="text-[10px]"
            style={{ color: 'var(--text-muted)' }}
          >
            {formatTime(message.createdAt)}
          </span>
          <div
            className="rounded-2xl rounded-br-md px-3 py-2 text-sm shadow-sm"
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

  const hasStreamingCursor = !message.isFinal && !message.error && !message.content;

  return (
    <div className="flex justify-start">
      <div className="flex max-w-[80%] items-end gap-2">
        <BotAvatar />
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
              AI 助手
            </span>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {formatTime(message.createdAt)}
            </span>
          </div>

          {/* Main content (token text) — shows cursor while streaming */}
          {message.content ? (
            <div
              className="rounded-2xl rounded-bl-md px-3 py-2 text-sm leading-relaxed shadow-sm"
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {message.content}
              {/* Blinking streaming cursor */}
              {!message.isFinal && !message.error && (
                <span className="streaming-cursor" />
              )}
            </div>
          ) : hasStreamingCursor ? (
            <div
              className="inline-block rounded-2xl rounded-bl-md px-3 py-2 shadow-sm"
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
              }}
            >
              <span className="streaming-cursor text-sm" style={{ color: 'var(--text-muted)' }}>
                正在思考...
              </span>
            </div>
          ) : null}

          {/* Error block */}
          {message.error && (
            <div
              className="rounded-xl border px-3 py-2 text-xs"
              style={{
                borderColor: 'var(--error)',
                background: 'var(--error-light)',
                color: 'var(--error)',
              }}
            >
              <div className="mb-0.5 flex items-center gap-1 font-semibold">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {message.error.code ? `[${message.error.code}] ` : ''}出错了
              </div>
              <div className="opacity-80">{message.error.message}</div>
            </div>
          )}

          {/* SQL block (collapsible) */}
          {message.sql && <SqlBlock sql={message.sql.sql} executed={message.sql.executed} />}

          {/* Chart */}
          {message.chart && <DynamicChart chart={message.chart} />}

          {/* Analysis */}
          {message.analysis && (
            <div
              className="rounded-xl border px-3 py-2 text-sm"
              style={{
                borderColor: 'var(--warning)',
                background: 'var(--warning-light)',
                color: 'var(--text-primary)',
              }}
            >
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--warning)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                分析报告
              </div>
              <div className="whitespace-pre-wrap leading-relaxed">{message.analysis}</div>
            </div>
          )}

          {/* "Done" — no more content coming */}
          {message.isFinal && !message.content && !message.error && !message.sql && !message.chart && !message.analysis && (
            <div
              className="rounded-xl border px-3 py-2 text-xs italic"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            >
              已收到你的问题，正在处理...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SqlBlock({ sql, executed }: { sql: string; executed: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="overflow-hidden rounded-xl border text-xs"
      style={{ borderColor: 'var(--border)' }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors"
        style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
      >
        <span className="flex items-center gap-1.5 font-mono">
          {executed ? (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--success)' }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              已执行 SQL
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)' }}>
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              生成的 SQL
            </>
          )}
        </span>
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {open ? '收起' : '展开'}
        </span>
      </button>
      {open && (
        <pre
          className="overflow-x-auto border-t px-3 py-2 font-mono leading-relaxed"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--bg-primary)',
            color: 'var(--text-secondary)',
          }}
        >
          <code>{sql}</code>
        </pre>
      )}
    </div>
  );
}

export default MessageBubble;
