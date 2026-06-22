import { useState, useCallback, useRef, useEffect } from 'react';
import { SSEEventType } from '@workspace/types';
import type {
  SSEMessage,
  SSETokenData,
  SSESQLData,
  SSEChartData,
  SSEAnalysisData,
  SSEErrorData,
} from '@workspace/types';

interface UseSSEChatOptions {
  onToken?: (data: SSETokenData) => void;
  onSQL?: (data: SSESQLData) => void;
  onChart?: (data: SSEChartData) => void;
  onAnalysis?: (data: SSEAnalysisData) => void;
  onError?: (data: SSEErrorData) => void;
  onDone?: () => void;
}

interface UseSSEChatReturn {
  sendMessage: (message: string) => void;
  isLoading: boolean;
  error: string | null;
  abort: () => void;
}

/**
 * useSSEChat - subscribe to backend SSE stream
 *
 * Endpoint: GET {API_BASE}/chat/stream?message=...
 * Each emitted MessageEvent is parsed and dispatched to the matching callback.
 */
export function useSSEChat(options: UseSSEChatOptions = {}): UseSSEChatReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const close = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const dispatch = useCallback((msg: SSEMessage) => {
    const data = JSON.parse(msg.data);
    const opts = optionsRef.current;
    switch (msg.event) {
      case SSEEventType.TOKEN:
        opts.onToken?.(data as SSETokenData);
        break;
      case SSEEventType.SQL:
        opts.onSQL?.(data as SSESQLData);
        break;
      case SSEEventType.CHART:
        opts.onChart?.(data as SSEChartData);
        break;
      case SSEEventType.ANALYSIS:
        opts.onAnalysis?.(data as SSEAnalysisData);
        break;
      case SSEEventType.ERROR:
        opts.onError?.(data as SSEErrorData);
        setError((data as SSEErrorData).message);
        break;
      case SSEEventType.DONE:
        opts.onDone?.();
        break;
    }
  }, []);

  const sendMessage = useCallback(
    (message: string) => {
      if (!message?.trim()) {
        setError('消息不能为空');
        return;
      }

      // Close any existing stream before opening a new one
      close();
      setError(null);
      setIsLoading(true);

      const baseURL =
        import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      const url = `${baseURL}/chat/stream?message=${encodeURIComponent(message)}`;
      const source = new EventSource(url);
      eventSourceRef.current = source;

      const handle = (event: MessageEvent) => {
        try {
          const parsed: SSEMessage = {
            event: event.type as SSEMessage['event'],
            data: event.data,
          };
          dispatch(parsed);
        } catch (err) {
          console.error('Failed to parse SSE event', err, event);
        }
      };

      // EventSource dispatches each event.type as a separate listener
      Object.values(SSEEventType).forEach((evt) => {
        source.addEventListener(evt, handle as EventListener);
      });

      source.onerror = () => {
        // Only mark error if stream isn't closing intentionally
        if (source.readyState === EventSource.CLOSED) {
          setIsLoading(false);
        } else {
          setError('连接中断');
          setIsLoading(false);
          source.close();
        }
      };

      // Once the server sends 'done', close the connection
      const originalDone = optionsRef.current.onDone;
      optionsRef.current = {
        ...optionsRef.current,
        onDone: () => {
          originalDone?.();
          setIsLoading(false);
          source.close();
        },
      };
    },
    [close, dispatch],
  );

  const abort = useCallback(() => {
    close();
    setIsLoading(false);
  }, [close]);

  // Cleanup on unmount
  useEffect(() => {
    return () => close();
  }, [close]);

  return { sendMessage, isLoading, error, abort };
}
