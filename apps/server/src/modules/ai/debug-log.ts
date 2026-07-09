import { Logger } from "@nestjs/common";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * M7 — 图表链路调试日志体系 (TraceLogger)
 *
 * 解决 M1-M6 实施后暴露的"画图报错但服务端无日志"问题:
 *   - 多处 catch 块没有 logger.error
 *   - LLM 原始输出截断到 200 字符
 *   - 多 session 并发时日志无法归属同一请求
 *   - SQL 执行时间 / HallucinationError 触发时无 dump 原始数据
 *
 * 用法:
 *   1. SSE 入口 (chat.controller) 用 runWithTrace 注入 traceId + sessionId + userMessage
 *   2. 链路任意位置调 traceLogger.trace({ phase, ctx, payload?, err?, level })
 *   3. AsyncLocalStorage 自动跨 setTimeout/Promise/await 传递 TraceContext
 *   4. CHART_DEBUG=1 开启 payload dump (默认关,生产低开销)
 */

export interface TraceContext {
  /** UUID, chat.controller 入口生成 */
  traceId: string;
  /** session 维度,Planner 注入的 opts.sessionId */
  sessionId?: string;
  /** 用户原始问题前 200 字符,便于定位"哪个问题触发的" */
  userMessage?: string;
  /** 预留:多用户场景 */
  userId?: string;
  /** Date.now(),用于计算 elapsedMs */
  startTs: number;
}

const traceStore = new AsyncLocalStorage<TraceContext>();

/**
 * 在 AsyncLocalStorage 上下文中运行 fn,所有异步子调用都能拿到 ctx。
 */
export function runWithTrace<T>(ctx: TraceContext, fn: () => T): T {
  return traceStore.run(ctx, fn);
}

/** 获取当前异步上下文的 TraceContext (无上下文返回 undefined) */
export function currentTrace(): TraceContext | undefined {
  return traceStore.getStore();
}

/**
 * 图表链路的 14 个调试阶段,定位问题时 grep phase 即可。
 */
export type ChartPhase =
  | "controller-entry"
  | "planner-invoke"
  | "tool-call"
  | "sql-execute"
  | "chart-agent"
  | "chart-assemble"  // [M13-V2] ChartAssembler 装配阶段
  | "llm-invoke"
  | "llm-raw"
  | "parse-and-validate"
  | "zod-fail"
  | "hallucination-check"
  | "auto-fix"
  | "intent-mode"
  | "fallback"
  | "tool-result"
  | "sse-error";

export interface ChartTracePayload {
  phase: ChartPhase;
  /** 阶段上下文 (groupBy/metrics/region/category/sessionId/temperature/...) */
  ctx?: Record<string, unknown>;
  /** 关键 payload (raw LLM 输出 / raw rows / chart option / SQL 结果前 5 行) */
  payload?: unknown;
  /** 错误对象 (会被序列化为 name/message/stack) */
  err?: unknown;
  level?: "log" | "warn" | "error";
  /** 强制 dump payload (覆盖 CHART_DEBUG 默认值) */
  dumpPayload?: boolean;
}

class TraceLogger {
  private readonly nest = new Logger("ChartTrace");

  trace(evt: ChartTracePayload): void {
    const shouldDump =
      evt.dumpPayload ?? process.env.CHART_DEBUG === "1";

    const t = currentTrace();
    const elapsedMs = t ? Date.now() - t.startTs : undefined;

    const meta = {
      traceId: t?.traceId,
      sessionId: t?.sessionId,
      userMessage: t?.userMessage?.slice(0, 80),
      elapsedMs,
      phase: evt.phase,
      ctx: evt.ctx,
      err: this.serializeErr(evt.err),
    };

    const head = `[trace:${t?.traceId ?? "-"}][${evt.phase}] ${JSON.stringify(meta)}`;

    if (evt.level === "error") this.nest.error(head);
    else if (evt.level === "warn") this.nest.warn(head);
    else this.nest.log(head);

    // Payload dump (CHART_DEBUG=1 才打,避免生产噪声)
    if (shouldDump && evt.payload !== undefined) {
      const payloadStr = this.stringifyPayload(evt.payload);
      this.nest.warn(
        `[trace:${t?.traceId ?? "-"}][payload:${evt.phase}] ${payloadStr}`,
      );
    }
  }

  private serializeErr(err: unknown): unknown {
    if (err === undefined || err === null) return undefined;
    if (err instanceof Error) {
      return {
        name: err.name,
        message: err.message,
        stack: err.stack?.split("\n").slice(0, 10).join("\n"), // 只取前 10 行避免日志爆炸
      };
    }
    return err;
  }

  private stringifyPayload(payload: unknown): string {
    if (typeof payload === "string") {
      return payload.slice(0, 4000);
    }
    try {
      return JSON.stringify(payload).slice(0, 4000);
    } catch {
      return String(payload).slice(0, 4000);
    }
  }
}

export const traceLogger = new TraceLogger();