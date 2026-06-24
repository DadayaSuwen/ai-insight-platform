import { useState, useCallback, useRef, useEffect } from "react";

interface ToolCallData {
  name: string;
  args: Record<string, unknown>;
}

interface ToolResultData {
  name: string;
  result: Record<string, unknown>;
}

interface ErrorData {
  code: string;
  message: string;
}

interface UseSSEChatOptions {
  onText?: (data: { content: string }) => void;
  onToolCall?: (data: ToolCallData) => void;
  onToolResult?: (data: ToolResultData) => void;
  onError?: (data: ErrorData) => void;
  onDone?: () => void;
}

interface UseSSEChatReturn {
  sendMessage: (message: string, sessionId: string) => void;
  isLoading: boolean;
  error: string | null;
  abort: () => void;
}

/**
 * useSSEChat — stream responses from the backend using fetch + ReadableStream.
 *
 * 在新架构下，只处理 5 种核心事件：text, tool_call, tool_result, error, done。
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

  const parseSSELine = (line: string): { event?: string; data?: string } => {
    if (line.startsWith("event:")) {
      return { event: line.slice(6).trim() };
    }
    if (line.startsWith("data:")) {
      return { data: line.slice(5).trim() };
    }
    return {};
  };

  const dispatch = useCallback((eventType: string, rawData: string) => {
    if (!rawData) return;

    let data: unknown;
    try {
      data = JSON.parse(rawData);
    } catch (err) {
      console.error(
        "[useSSEChat] Failed to parse SSE event data",
        err,
        rawData,
      );
      return;
    }

    const opts = optionsRef.current;

    switch (eventType) {
      case "text":
        opts.onText?.(data as { content: string });
        break;
      case "tool_call":
        opts.onToolCall?.(data as ToolCallData);
        break;
      case "tool_result":
        opts.onToolResult?.(data as ToolResultData);
        break;
      case "error":
        opts.onError?.(data as ErrorData);
        setError((data as ErrorData).message);
        break;
      case "done":
        abortControllerRef.current = null;
        setIsLoading(false);
        opts.onDone?.();
        break;
      default:
        // 忽略未知事件类型
        break;
    }
  }, []);

  const sendMessage = useCallback(
    // ★ 新增 sessionId 参数
    (message: string, sessionId: string) => {
      if (!message?.trim()) {
        setError("消息不能为空");
        return;
      }
      if (!sessionId) {
        setError("会话 ID 丢失，请刷新页面重试");
        return;
      }

      close();
      setError(null);
      setIsLoading(true);

      const baseURL =
        import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";
      // ★ URL 中拼接 sessionId
      const url = `${baseURL}/chat/stream?message=${encodeURIComponent(message)}&sessionId=${sessionId}`;

      const controller = new AbortController();
      abortControllerRef.current = controller;

      fetch(url, { signal: controller.signal })
        .then((res) => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }
          const reader = res.body?.getReader();
          if (!reader) {
            throw new Error("Response body is not readable");
          }

          const decoder = new TextDecoder();
          let buffer = "";

          const readChunk = () => {
            reader.read().then(({ done, value }) => {
              if (done || controller.signal.aborted) {
                return;
              }

              buffer += decoder.decode(value, { stream: true });

              const messages: string[] = [];
              let start = 0;
              let idx: number;
              while ((idx = buffer.indexOf("\n\n", start)) !== -1) {
                messages.push(buffer.slice(start, idx));
                start = idx + 2;
              }
              buffer = buffer.slice(start);

              for (const raw of messages) {
                let rawEvent = "";
                let rawData = "";

                for (const line of raw.split("\n")) {
                  const parsed = parseSSELine(line);
                  if (parsed.event !== undefined) rawEvent = parsed.event;
                  if (parsed.data !== undefined) {
                    rawData = rawData
                      ? `${rawData}\n${parsed.data}`
                      : parsed.data;
                  }
                }

                if (rawEvent && rawData) {
                  dispatch(rawEvent, rawData);
                }
              }

              readChunk();
            });
          };

          readChunk();
        })
        .catch((err: Error) => {
          if (err.name === "AbortError") {
            return;
          }
          console.error("[useSSEChat] Connection error", err);
          setError(err.message || "连接中断");
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

  useEffect(() => {
    return () => close();
  }, [close]);

  return { sendMessage, isLoading, error, abort };
}
