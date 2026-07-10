import { Injectable } from "@nestjs/common";

/**
 * 最近一条工具结果缓存。
 *
 * 为什么需要:
 *  Planner 拿到 LLM 的 tool_call 后,工具执行结果通过 SSE 推给前端,
 *  但 LLM 看不到自己上一步的结果(只能看到 ToolMessage content 序列化后的字符串)。
 *  当 Planner 决定接着调用 generate_insight 时,如果 LLM 没把上一条 tool_result 的
 *  完整 JSON 塞进 `data` 参数(被截断/丢失/简化),InsightAgent 就会拿到空洞数据。
 *
 * 设计:
 *  - 单例 in-memory,容量 32 条,FIFO 淘汰
 *  - 提供 getLatest() / getByName() 给 InsightAgent 兜底用
 *  - 进程重启即丢失(可以接受,新会话重新查询即可)
 */
@Injectable()
export class ToolResultContext {
  private readonly store: Array<{
    sessionId: string;
    toolCallId: string;
    name: string;
    result: unknown;
    createdAt: number;
  }> = [];
  private readonly maxSize = 32;

  push(sessionId: string, toolCallId: string, name: string, result: unknown): void {
    this.store.push({
      sessionId,
      toolCallId,
      name,
      result,
      createdAt: Date.now(),
    });
    while (this.store.length > this.maxSize) {
      this.store.shift();
    }
  }

  /**
   * 拿当前 session 最近一条工具结果。
   * 用于 generate_insight 在 LLM 没传 data 时兜底。
   */
  getLatest(sessionId: string): { name: string; result: unknown } | null {
    for (let i = this.store.length - 1; i >= 0; i--) {
      if (this.store[i].sessionId === sessionId) {
        return { name: this.store[i].name, result: this.store[i].result };
      }
    }
    return null;
  }

  /**
   * 拿当前 session 最近一条 "数据类" 工具的结果 (query_details / gen_chart)。
   * generate_insight 应该分析数据,不是分析图表或上一次的洞察。
   */
  getLatestData(sessionId: string): { name: string; result: unknown } | null {
    const dataNames = new Set(["query_details", "gen_chart"]);
    for (let i = this.store.length - 1; i >= 0; i--) {
      if (this.store[i].sessionId === sessionId && dataNames.has(this.store[i].name)) {
        return { name: this.store[i].name, result: this.store[i].result };
      }
    }
    return null;
  }

  /** 清空某 session 的缓存(可选,目前未使用) */
  clear(sessionId: string): void {
    for (let i = this.store.length - 1; i >= 0; i--) {
      if (this.store[i].sessionId === sessionId) this.store.splice(i, 1);
    }
  }
}