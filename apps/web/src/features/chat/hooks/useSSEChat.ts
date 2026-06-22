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
 *
 * Connection-error handling:
 * - EventSource's built-in 'error' event (no data) = connection problem
 *   (network drop, server gone, intentional close). We ignore it if the close
 *   was triggered by a received 'done' event.
 * - Server-sent 'error' SSE event (with data) = application error → dispatched
 *   to onError callback.
 */
export function useSSEChat(options: UseSSEChatOptions = {}): UseSSEChatReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // When true, ignore the next EventSource 'error' event because we triggered
  // it ourselves by calling source.close() after receiving 'done'.
  const closingIntentionallyRef = useRef(false);

  const close = useCallback(() => {
    if (eventSourceRef.current) {
      closingIntentionallyRef.current = true;
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const dispatch = useCallback((msg: SSEMessage) => {
    let data: unknown;
    try {
      data = JSON.parse(msg.data);
    } catch (err) {
      console.error('Failed to parse SSE event data', err, msg);
      return;
    }
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
        // Server closed its end of the stream after 'done'. We must
        // explicitly close the EventSource here — otherwise it will
        // auto-reconnect (default retry ~3s) and re-trigger the whole
        // pipeline, causing token events to be appended repeatedly.
        closingIntentionallyRef.current = true;
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        setIsLoading(false);
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

      close();
      setError(null);
      setIsLoading(true);
      closingIntentionallyRef.current = false;

      const baseURL =
        import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      const url = `${baseURL}/chat/stream?message=${encodeURIComponent(message)}`;
      const source = new EventSource(url);
      eventSourceRef.current = source;

      const handle = (event: MessageEvent) => {
        // Server-sent SSE event with data payload
        if (!event.data) return; // skip events without data
        const parsed: SSEMessage = {
          event: event.type as SSEMessage['event'],
          data: event.data,
        };
        dispatch(parsed);
      };

      // Register listeners for all SSE event types EXCEPT 'error',
      // which is reserved by EventSource for connection-level failures.
      Object.values(SSEEventType)
        .filter((evt) => evt !== SSEEventType.ERROR)
        .forEach((evt) => {
          source.addEventListener(evt, handle as EventListener);
        });

      // Connection-level error handler. Distinguishes between:
      //  - Server-sent 'error' SSE event (has data) → dispatch to onError
      //  - EventSource built-in connection error (no data) → mark connection lost
      source.addEventListener(SSEEventType.ERROR, ((event: MessageEvent) => {
        if (event.data) {
          // Server-sent error event, dispatch normally
          handle(event);
        } else {
          // Connection-level error
          if (closingIntentionallyRef.current) {
            closingIntentionallyRef.current = false;
            return;
          }
          if (source.readyState === EventSource.CLOSED) {
            setIsLoading(false);
          } else {
            setError('连接中断');
            setIsLoading(false);
            source.close();
          }
        }
      }) as EventListener);

      // 'open' connection event — fires when the EventSource handshake completes.
      // We don't act on it, but registering a no-op keeps the connection from
      // being treated as idle by some browsers.
      source.addEventListener('open', () => {
        // no-op
      });
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
