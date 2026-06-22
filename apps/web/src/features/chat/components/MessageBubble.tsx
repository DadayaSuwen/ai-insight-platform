import { useState } from 'react';
import DynamicChart from './DynamicChart';
import type { ChatMessage } from '../types';
import { isAssistant } from '../types';

interface MessageBubbleProps {
  message: ChatMessage;
}

/**
 * MessageBubble - render a single chat message.
 *
 * User messages: simple right-aligned bubble.
 * Assistant messages: left-aligned with optional SQL / chart / analysis / error blocks.
 */
function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-lg bg-blue-500 px-3 py-2 text-sm text-white shadow-sm">
          {message.content}
        </div>
      </div>
    );
  }

  if (!isAssistant(message)) return null;

  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] space-y-2">
        {/* Main content (token text) */}
        {message.content && (
          <div className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-900 shadow-sm whitespace-pre-wrap">
            {message.content}
          </div>
        )}

        {/* Error block */}
        {message.error && (
          <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
            <div className="font-semibold">
              {message.error.code ? `[${message.error.code}] ` : ''}出错了
            </div>
            <div className="mt-1">{message.error.message}</div>
          </div>
        )}

        {/* SQL block (collapsible) */}
        {message.sql && <SqlBlock sql={message.sql.sql} executed={message.sql.executed} />}

        {/* Chart */}
        {message.chart && <DynamicChart chart={message.chart} />}

        {/* Analysis */}
        {message.analysis && (
          <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <div className="mb-1 text-xs font-semibold text-amber-700">分析报告</div>
            <div className="whitespace-pre-wrap">{message.analysis}</div>
          </div>
        )}

        {/* Streaming indicator */}
        {!message.isFinal && !message.error && (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-400" />
            <span>正在生成...</span>
          </div>
        )}
      </div>
    </div>
  );
}

function SqlBlock({ sql, executed }: { sql: string; executed: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded border bg-white text-xs">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-left text-gray-600 hover:bg-gray-50"
      >
        <span className="font-mono">
          {executed ? '✓ 已执行 SQL' : '生成的 SQL'}
        </span>
        <span className="text-gray-400">{open ? '收起' : '展开'}</span>
      </button>
      {open && (
        <pre className="overflow-x-auto border-t bg-gray-50 px-3 py-2 text-[11px] text-gray-800">
          <code>{sql}</code>
        </pre>
      )}
    </div>
  );
}

export default MessageBubble;
