import { useRef, useEffect, useCallback } from 'react';
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

/**
 * ChatWindow - main chat surface.
 *
 * Wires ChatInput → useSSEChat → useChatStore.
 *
 * Streaming model: assistant messages are stored in the zustand store from
 * the moment a user sends. SSE events update the *last* assistant message
 * in place. When 'done' fires, we just mark `isFinal = true`. There is
 * exactly one source of truth for the message list, so React never sees
 * duplicate keys or out-of-order updates.
 */
function ChatWindow() {
  const messages = useChatStore((s) => s.messages);
  const addMessage = useChatStore((s) => s.addMessage);
  const updateLastAssistant = useChatStore((s) => s.updateLastAssistant);

  const scrollRef = useRef<HTMLDivElement>(null);

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
      // Push both at once so the list is always consistent
      addMessage(userMsg);
      addMessage(draftAssistant);
      sendMessage(text);
    },
    [addMessage, sendMessage],
  );

  return (
    <div className="flex h-full flex-col bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white px-4 py-3 shadow-sm">
        <h1 className="text-base font-semibold text-gray-800">AI Insight Platform</h1>
        <p className="text-xs text-gray-500">自然语言查询 · 数据可视化 · 智能分析</p>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            开始对话吧,试试: "按类别显示销售额"
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          连接错误: {error}
        </div>
      )}

      {/* Input */}
      <ChatInput onSend={handleSend} isLoading={isLoading} />
    </div>
  );
}

export default ChatWindow;
