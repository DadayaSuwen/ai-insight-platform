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
 * useSSEChat — stream responses from the backend using fetch + ReadableStream.
 *
 * Uses GET /chat/stream?message=... (backend SSE endpoint via NestJS @Sse decorator).
 * Switched from EventSource to fetch+ReadableStream to support streaming text
 * with proper back-pressure and non-URL-encoded body delivery.
 *
 * Connection errors → `error` state.
 * Server-sent 'error' SSE event → onError callback + error state.
 * 'done' SSE event → onDone callback, closes the stream.
 */
export function useSSEChat(options: UseSSEChatOptions = {}): UseSSEChatReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const close = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  /**
   * Parse a single SSE data block from the read buffer.
   * Handles both single-line "data: xxx" and multi-line "data: xxx\ndata: yyy" blocks.
   */
  const parseSSELine = (line: string): { event?: string; data?: string } => {
    if (line.startsWith('event:')) {
      return { event: line.slice(6).trim() };
    }
    if (line.startsWith('data:')) {
      return { data: line.slice(5).trim() };
    }
    return {};
  };

  /**
   * Parse a complete SSE message (all data lines + optional event type)
   * joined with double-newline-separated chunks from the stream.
   */
  const parseSSEMessage = (rawEvent: string, rawData: string): SSEMessage => {
    return {
      event: rawEvent as SSEMessage['event'],
      data: rawData,
    };
  };

  const dispatch = useCallback((msg: SSEMessage) => {
    let data: unknown;
    try {
      data = JSON.parse(msg.data);
    } catch (err) {
      console.error('[useSSEChat] Failed to parse SSE event data', err, msg);
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
        abortControllerRef.current = null;
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

      const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      const url = `${baseURL}/chat/stream?message=${encodeURIComponent(message)}`;

      const controller = new AbortController();
      abortControllerRef.current = controller;

      fetch(url, { signal: controller.signal })
        .then((res) => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }
          const reader = res.body?.getReader();
          if (!reader) {
            throw new Error('Response body is not readable');
          }

          const decoder = new TextDecoder();
          let buffer = '';

          const readChunk = () => {
            reader.read().then(({ done, value }) => {
              if (done || controller.signal.aborted) {
                // Stream ended cleanly
                return;
              }

              buffer += decoder.decode(value, { stream: true });

              // Split on double newlines (SSE message boundary)
              const messages: string[] = [];
              let start = 0;
              let idx: number;
              while ((idx = buffer.indexOf('\n\n', start)) !== -1) {
                messages.push(buffer.slice(start, idx));
                start = idx + 2;
              }
              buffer = buffer.slice(start);

              for (const raw of messages) {
                let rawEvent = '';
                let rawData = '';

                for (const line of raw.split('\n')) {
                  const parsed = parseSSELine(line);
                  if (parsed.event !== undefined) rawEvent = parsed.event;
                  if (parsed.data !== undefined) {
                    // Multi-line data: append with newline separator
                    rawData = rawData ? `${rawData}\n${parsed.data}` : parsed.data;
                  }
                }

                if (rawEvent || rawData) {
                  dispatch(parseSSEMessage(rawEvent || SSEEventType.TOKEN, rawData));
                }
              }

              readChunk();
            });
          };

          readChunk();
        })
        .catch((err: Error) => {
          if (err.name === 'AbortError') {
            // Intentionally aborted — not an error
            return;
          }
          console.error('[useSSEChat] Connection error', err);
          setError(err.message || '连接中断');
          setIsLoading(false);
        });
    },
    [close, dispatch],
  );

  const abort = useCallback(() => {
    close();
    setIsLoading(false);
    setError(null);
  }, [close]);

  // Cleanup on unmount
  useEffect(() => {
    return () => close();
  }, [close]);

  return { sendMessage, isLoading, error, abort };
}
