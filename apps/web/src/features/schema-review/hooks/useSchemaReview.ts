import { useState, useRef, useCallback } from 'react';
import { TOKEN_KEY } from '../../../core/api/AxiosInstance';
import { startReview as apiStartReview, finalizeReview } from '../api';
import type { PendingField, StartReviewResponse } from '../api';

/**
 * [Sprint 6] Schema Review 对话 hook
 *
 * 管理纠错对话的状态和 SSE 通信。
 */

export interface FieldUpdated {
  table: string;
  field: string;
  chineseName: string;
  role: string;
}

export interface NextQuestion {
  question: string;
  fieldName: string;
  tableName: string;
  quickReplies: string[];
  evidence: string;
  remaining: number;
}

export interface ReviewDone {
  remaining: number;
  allConfirmed: boolean;
}

interface UseSchemaReviewReturn {
  reviewId: string | null;
  fields: PendingField[];
  messages: ChatMessage[];
  currentQuestion: NextQuestion | null;
  done: ReviewDone | null;
  isProcessing: boolean;
  error: string | null;
  startReview: (datasourceId: string) => Promise<void>;
  sendMessage: (message: string) => Promise<void>;
  finalize: () => Promise<void>;
}

interface ChatMessage {
  role: 'ai' | 'user';
  content: string;
  fieldName?: string;
  quickReplies?: string[];
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export function useSchemaReview(): UseSchemaReviewReturn {
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [fields, setFields] = useState<PendingField[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<NextQuestion | null>(null);
  const [done, setDone] = useState<ReviewDone | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const startReview = useCallback(async (datasourceId: string) => {
    setIsProcessing(true);
    setError(null);
    try {
      const result: StartReviewResponse = await apiStartReview(datasourceId);
      setReviewId(result.reviewId);
      setFields(result.fields);

      // 发第一条消息触发首个提问
      const firstMsg = `开始 Schema 确认。共有 ${result.pendingFields} 个字段置信度不足。`;
      setMessages([{ role: 'user', content: firstMsg }]);

      await sendSSEMessage(result.reviewId, firstMsg);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const sendSSEMessage = useCallback(async (id: string, message: string) => {
    setIsProcessing(true);
    const token = localStorage.getItem(TOKEN_KEY);
    const url = `${API_BASE}/api/schema/review/chat?reviewId=${encodeURIComponent(id)}&message=${encodeURIComponent(message)}`;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
          Accept: 'text/event-stream',
        },
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let currentEvent = '';

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const raw = line.slice(6);
            try {
              const data = JSON.parse(raw);
              handleSSEEvent(currentEvent, data);
            } catch { /* skip */ }
            currentEvent = '';
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError((err as Error).message);
      }
    } finally {
      setIsProcessing(false);
    }

    function handleSSEEvent(eventType: string, data: Record<string, unknown>) {
      switch (eventType) {
        case 'ai_thinking':
          setMessages((prev) => [
            ...prev,
            { role: 'ai' as const, content: (data as { content: string }).content },
          ]);
          break;

        case 'field_updated': {
          const upd = data as unknown as FieldUpdated;
          setFields((prev) =>
            prev.filter((f) => !(f.table === upd.table && f.field === upd.field)),
          );
          setMessages((prev) => [
            ...prev,
            {
              role: 'ai' as const,
              content: `✓ 已确认 ${upd.table}.${upd.field} →「${upd.chineseName}」`,
              fieldName: `${upd.table}.${upd.field}`,
            },
          ]);
          break;
        }

        case 'next_question': {
          const q = data as unknown as NextQuestion;
          setCurrentQuestion(q);
          setMessages((prev) => [
            ...prev,
            {
              role: 'ai' as const,
              content: q.question,
              fieldName: `${q.tableName}.${q.fieldName}`,
              quickReplies: q.quickReplies,
            },
          ]);
          break;
        }

        case 'done': {
          const d = data as unknown as ReviewDone;
          setDone(d);
          if (d.allConfirmed) {
            setMessages((prev) => [
              ...prev,
              { role: 'ai' as const, content: '✓ 所有字段已确认完毕！可以生成工作台了。' },
            ]);
          }
          break;
        }

        case 'error':
          setError((data as { message: string }).message);
          break;
      }
    }
  }, []);

  const sendMessage = useCallback(async (message: string) => {
    if (!reviewId) return;
    setMessages((prev) => [...prev, { role: 'user', content: message }]);
    await sendSSEMessage(reviewId, message);
  }, [reviewId, sendSSEMessage]);

  const finalize = useCallback(async () => {
    if (!reviewId) return;
    setIsProcessing(true);
    try {
      await finalizeReview(reviewId);
      setDone({ remaining: 0, allConfirmed: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsProcessing(false);
    }
  }, [reviewId]);

  return {
    reviewId,
    fields,
    messages,
    currentQuestion,
    done,
    isProcessing,
    error,
    startReview,
    sendMessage,
    finalize,
  };
}
