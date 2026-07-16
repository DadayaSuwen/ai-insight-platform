import { useState, useCallback, useRef, useEffect } from "react";
import { createParser, type EventSourceMessage } from "eventsource-parser";
import type {
  ToolCallData,
  ToolResultData,
  TextEventData,
  ErrorEventData,
  DoneEventData,
} from "../types";

interface UseSSEChatOptions {
  onText?: (data: TextEventData) => void;
  onToolCall?: (data: ToolCallData) => void;
  onToolResult?: (data: ToolResultData) => void;
  onError?: (data: ErrorEventData) => void;
  /** `data` 可能为 null/undefined，参见 DoneEventData 注释 */
  onDone?: (data?: DoneEventData) => void;
}

interface UseSSEChatReturn {
  sendMessage: (message: string, sessionId: string) => void;
  isLoading: boolean;
  error: string | null;
  abort: () => void;
}

interface InFlightRequest {
  message: string;
  sessionId: string;
  /** 已重试次数（0 = 第一次尝试） */
  attempt: number;
  controller: AbortController;
}

/** 最多重试 3 次（含首次共 4 次），退避 500ms / 1s / 2s */
const MAX_RETRY = 3;
const BACKOFF_MS = [500, 1_000, 2_000];

/**
 * useSSEChat — 流式对话客户端
 *
 * 关键设计：
 *   1. 用 eventsource-parser 替代手写 SSE 解析（CRLF / 多行 data: 拼接 / UTF-8
 *      chunk 边界全交给它处理）。
 *   2. TextDecoder 用 { fatal: true }：遇到非法字节立即抛错而非输出乱码。
 *   3. 网络抖动用指数退避重连（最多 3 次）；用户主动 Stop（AbortError）不重连。
 *   4. 状态机：isLoading / abortControllerRef 任何路径终止（done / error / abort /
 *      重试耗尽）都正确复位。
 */
export function useSSEChat(options: UseSSEChatOptions = {}): UseSSEChatReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 用 ref 持有最新 options，避免 useCallback 闭包陷阱
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // 当前流的 controller；非空 = 流在跑
  const abortControllerRef = useRef<AbortController | null>(null);
  // 当前流对应的请求（用于重连时重放）
  const inFlightRef = useRef<InFlightRequest | null>(null);

  /** 彻底清理：取消 controller + 清空 inFlight + 复位 loading */
  const cleanup = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    inFlightRef.current = null;
    setIsLoading(false);
  }, []);

  /**
   * 解析单条 SSE 事件并分派。
   * eventsource-parser 帮我们处理了多行 data: 拼接 / LF/CRLF 兼容 / 注释行。
   * 这里只剩「拿到 event + data，做类型校验 + 派发」一件事。
   */
  const dispatch = useCallback((evt: EventSourceMessage) => {
    const opts = optionsRef.current;
    const eventType = evt.event;
    const rawData = evt.data;

    if (!rawData) return;

    // done 事件 data 可以为空（后端可能发 { session: null } 或直接空）
    if (eventType === "done") {
      let parsed: DoneEventData | undefined;
      if (rawData && rawData !== "{}" && rawData !== "null") {
        try {
          parsed = JSON.parse(rawData) as DoneEventData;
        } catch {
          parsed = undefined;
        }
      }
      abortControllerRef.current = null;
      inFlightRef.current = null;
      setIsLoading(false);
      opts.onDone?.(parsed);
      return;
    }

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

    switch (eventType) {
      case "text":
        opts.onText?.(data as TextEventData);
        break;
      case "tool_call":
        opts.onToolCall?.(data as ToolCallData);
        break;
      case "tool_result":
        opts.onToolResult?.(data as ToolResultData);
        break;
      case "error": {
        const e = data as ErrorEventData;
        // [M7] 把 SSE 错误 + traceId 打到 console,便于前端调试 + 客服查服务端日志
        console.error("[SSE error]", e);
        opts.onError?.(e);
        setError(e.message);
        // error 后不立即复位 isLoading —— ChatInput 仍能 abort；
        // 真正的复位由后端的 done 事件完成。
        // 兜底：若 3s 后还没收到 done，强制复位（防止按钮卡死）
        setTimeout(() => {
          if (abortControllerRef.current !== null) {
            abortControllerRef.current = null;
            inFlightRef.current = null;
            setIsLoading(false);
            opts.onDone?.();
          }
        }, 3_000);
        break;
      }
      default:
        // 忽略未知事件类型（保留扩展性：未来加 'thinking' / 'sql' 等不破坏前端）
        break;
    }
  }, []);

  /**
   * 实际发起一次 fetch + 流式读取。
   * 失败时根据 attempt 决定是否退避重试；AbortError 一律不重试。
   */
  const execute = useCallback(
    async (req: InFlightRequest): Promise<void> => {
      const { message, sessionId, attempt } = req;
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const baseURL =
        import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";
      const url = `${baseURL}/chat/stream`;

      // eventsource-parser 实例，每个 fetch 一个（否则多流交叉）
      const parser = createParser({
        onEvent: (evt) => dispatch(evt),
      });

      try {
        const token = localStorage.getItem("aiip.auth.token.v1");
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(url, {
          method: "POST",
          signal: controller.signal,
          headers,
          body: JSON.stringify({ message, sessionId }),
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error("Response body is not readable");
        }

        // fatal: true → 遇到非法 UTF-8 字节立刻抛错，绝不输出乱码
        const decoder = new TextDecoder("utf-8", { fatal: true });

        // 持续读 chunk，喂给 parser
        // 注意：parser.feed() 同步处理一条或多条完整事件
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          // 非法字节时 fatal decoder 会抛 TypeError
          const text = decoder.decode(value, { stream: true });
          parser.feed(text);
        }
        // flush 残留 buffer
        parser.feed(decoder.decode());

        // 正常结束：reader done，dispatch('done') 已经被 server 发过或者马上发；
        // 如果后端忘了发 done，这里补一个
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
          inFlightRef.current = null;
          setIsLoading(false);
          optionsRef.current.onDone?.();
        }
      } catch (err: unknown) {
        // 用户主动 abort：不报错、不重连
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        // 网络/解析错误：尝试重连
        const e = err instanceof Error ? err.message : String(err);
        console.error(
          `[useSSEChat] Stream failed (attempt ${attempt + 1}):`,
          e,
        );

        // 已重试耗尽：放弃，发 error + 复位
        if (attempt >= MAX_RETRY) {
          setError(`连接失败（已重试 ${MAX_RETRY} 次）：${e}`);
          abortControllerRef.current = null;
          inFlightRef.current = null;
          setIsLoading(false);
          optionsRef.current.onError?.({
            code: "CONNECTION_LOST",
            message: e,
          });
          optionsRef.current.onDone?.();
          return;
        }

        // 退避后重试（仅当不是用户主动 abort）
        const delay = BACKOFF_MS[attempt] ?? 2_000;
        setTimeout(() => {
          // 二次检查：用户可能在退避期间主动 abort 了
          if (inFlightRef.current !== req) return;
          void execute({ ...req, attempt: attempt + 1 });
        }, delay);
      }
    },
    [dispatch],
  );

  const sendMessage = useCallback(
    (message: string, sessionId: string) => {
      if (!message?.trim()) {
        setError("消息不能为空");
        return;
      }
      if (!sessionId) {
        setError("会话 ID 丢失，请刷新页面重试");
        return;
      }

      // 启动新流前确保旧流已死
      cleanup();
      setError(null);
      setIsLoading(true);

      const req: InFlightRequest = {
        message,
        sessionId,
        attempt: 0,
        controller: new AbortController(), // 占位，execute 内会替换
      };
      inFlightRef.current = req;
      void execute(req);
    },
    [cleanup, execute],
  );

  const abort = useCallback(() => {
    // 用户主动 Stop：不报错、不重连
    cleanup();
  }, [cleanup]);

  // 组件卸载时确保流被中断
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return { sendMessage, isLoading, error, abort };
}
