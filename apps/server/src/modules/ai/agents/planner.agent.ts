import { Injectable, Logger } from "@nestjs/common";
import {
  AIMessage,
  AIMessageChunk,
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { z } from "zod";
import { randomUUID } from "crypto";
import { LlmService } from "../llm/llm.service";
import { DatabaseService } from "../../database/database.service";
import { ChartHelper } from "../tools/chart.helper";
import type { StructuredTool } from "@langchain/core/tools";
import { createQuerySalesTool, createGenChartTool } from "../tools";

export interface PlannerToolCallData {
  /** 跨 turn 全局唯一的工具调用 id。Ollama 返回的是函数名，planner 层洗成 UUID。 */
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface PlannerToolResultData {
  /** 与对应 tool_call.id 配对，供前端 LangChain ToolMessage.tool_call_id 使用 */
  id: string;
  name: string;
  result: Record<string, unknown>;
}

export type PlannerStreamEvent =
  | { type: "text"; data: { content: string } }
  | { type: "error"; data: { code: string; message: string } }
  | { type: "done"; data: Record<string, never> }
  | { type: "tool_call"; data: PlannerToolCallData }
  | { type: "tool_result"; data: PlannerToolResultData }
  | { type: "thinking"; data: { content: string } };

@Injectable()
export class PlannerAgent {
  private readonly logger = new Logger(PlannerAgent.name);
  private readonly toolMap = new Map<string, StructuredTool>();
  private schema: string;

  constructor(
    private readonly llm: LlmService,
    private readonly db: DatabaseService,
    private readonly chartAgent: ChartHelper,
  ) {
    const querySalesTool = createQuerySalesTool(this.db);
    const genChartTool = createGenChartTool(this.db, this.chartAgent);

    this.toolMap.set("query_sales", querySalesTool);
    this.toolMap.set("gen_chart", genChartTool);

    this.schema = this.buildDefaultSchema();

    this.logger.log(
      `PlannerAgent initialized with tools: ${[...this.toolMap.keys()].join(", ")}`,
    );
  }

  /**
   * Bind tools to the current chat model each call.
   * In LangChain 0.3.x with @langchain/ollama, we pass the StructuredTool[] directly.
   */
  private getChat() {
    const baseChat = this.llm.getChatModel();
    const tools = [...this.toolMap.values()];

    // 直接传递 StructuredTool 数组，@langchain/ollama 会自动处理 Ollama API 所需的格式
    return baseChat.bindTools(tools);
  }

  private buildDefaultSchema(): string {
    return `Sales: id, productName, category, amount, quantity, region, saleDate, createdAt, updatedAt
ChatSession: id, userId, title, createdAt, updatedAt
ChatMessage: id, sessionId, role, content, metadata, createdAt`;
  }

  async refreshSchema(): Promise<void> {
    try {
      const rows = (await (this.db as any).getSchema?.()) as Array<{
        table_name: string;
        column_name: string;
        data_type: string;
      }>;

      if (!rows) return;

      const tables = new Map<string, string[]>();
      for (const row of rows) {
        const cols = tables.get(row.table_name) ?? [];
        cols.push(`${row.column_name} (${row.data_type})`);
        tables.set(row.table_name, cols);
      }

      const lines: string[] = [];
      for (const [table, cols] of tables) {
        lines.push(`${table}: ${cols.join(", ")}`);
      }
      this.schema = lines.join("\n");
      this.logger.log("Schema refreshed from database");
    } catch (err) {
      this.logger.warn(
        `Failed to refresh schema: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Build system prompt from tool Zod schemas.
   */
  private buildSystemPrompt(): string {
    const toolDescs = [...this.toolMap.entries()]
      .map(([name, tool]) => {
        const argsShape = (
          tool.schema as z.ZodObject<Record<string, z.ZodTypeAny>>
        ).shape;
        const params = Object.entries(argsShape)
          .map(([k, v]) => {
            const desc = (v as z.ZodTypeAny).description ?? "string";
            return `${k}: ${desc}`;
          })
          .join(", ");
        return `- ${name}(${params}): ${tool.description}`;
      })
      .join("\n");

    return `你是一个极其专业的企业级数据分析师。

可用工具:
 ${toolDescs}

数据库表结构:
 ${this.schema}

【重要规则】:
1. 如果用户询问数据相关问题，必须优先调用 query_sales 工具获取真实数据，绝不允许编造数据。
2. 如果用户要求画图，必须调用 gen_chart 工具。
3. 如果工具返回的数据无法满足用户的细节要求，请基于工具返回的现有数据进行总结，严禁说"因工具限制无法获取"这种推卸责任的话。
4. 你的回复必须使用格式良好的 Markdown 语法：
   - 使用 \`##\` 或 \`###\` 作为标题。
   - 使用 \`**加粗**\` 突出关键指标。
   - 如果有多个要点，使用无序列表 \`-\`。
5. 语言要精炼、专业，像麦肯锡的商业报告，不要有废话。
6. 【格式红线】：前端已经自动将工具返回的 summary 数据渲染成了精美的数据表格。因此，**你在回复中绝对禁止使用 Markdown 表格语法 (|---|---) 重复展示相同的数据！** 你只需要用自然语言对数据进行深入分析、对比和总结即可。`;
  }

  /**
   * Safely extract string content from AIMessage content which might be string or complex array.
   */
  private extractContent(content: AIMessage["content"]): string {
    if (typeof content === "string") {
      return content;
    }
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === "string") return part;
          if (typeof part === "object" && part !== null && "text" in part) {
            return String(part.text);
          }
          return "";
        })
        .join("");
    }
    return "";
  }

  async *invokeStream(
    message: string,
    history: BaseMessage[] = [], // ★ 接收 chat.service.ts 构造好的 LangChain 历史实例
    opts: { signal?: AbortSignal } = {},
  ): AsyncGenerator<PlannerStreamEvent, void, unknown> {
    // Planner 绕过 LlmService.invokeStream 直接调 chat.stream()，
    // 所以它本身没有超时保护。这里补一个本地 timeout（默认 120s），
    // 用 AbortSignal.any() 把外部 signal（客户端 Stop）和内部 timeout 合并。
    const STREAM_TIMEOUT_MS = Number(process.env.STREAM_TIMEOUT_MS ?? 120_000);
    const timeoutController = new AbortController();
    const timeoutTimer = setTimeout(
      () => timeoutController.abort(),
      STREAM_TIMEOUT_MS,
    );
    const combinedSignal = opts.signal
      ? AbortSignal.any([opts.signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const MAX_ITERATIONS = Number(process.env.MAX_ITERATIONS ?? 10);
      const systemPrompt = this.buildSystemPrompt();

      // chat.service.ts 的 buildHistoryMessages 已经把 DB 记录转成 BaseMessage[]，
      // 这里直接展开即可；末尾追加当前用户消息。
      const messages: BaseMessage[] = [
        new SystemMessage(systemPrompt),
        ...history,
        new HumanMessage(message),
      ];

      let iterations = 0;

      while (true) {
        iterations++;
        if (iterations > MAX_ITERATIONS) {
          this.logger.warn(
            `Max iterations (${MAX_ITERATIONS}) reached, forcing stop`,
          );
          yield {
            type: "error",
            data: {
              code: "MAX_ITERATIONS_REACHED",
              message: `已尝试 ${MAX_ITERATIONS} 次，仍无法完成请求，请尝试换一种问法。`,
            },
          };
          yield { type: "done", data: {} };
          return;
        }

        const stream = await this.getChat().stream(messages, {
          signal: combinedSignal,
        });

        // ★ 使用 AIMessageChunk 累积流式碎片
        let finalMessage: AIMessageChunk | undefined;

        for await (const chunk of stream) {
          // 客户端断开 / 内部超时 → 立即退出，避免再 yield 一段或继续触发 tool
          if (combinedSignal.aborted) {
            const reason = timeoutController.signal.aborted
              ? "timeout"
              : "client_disconnect";
            this.logger.log(`[PlannerAgent] Stream aborted (${reason})`);
            return;
          }
          // 1. 实时输出文本片段（打字机效果）
          const content = this.extractContent(chunk.content);
          if (content) {
            yield {
              type: "text",
              data: { content },
            };
          }

          // 2. 累积合并 chunk，LangChain 底层会自动拼好 tool_calls 的 args
          finalMessage = finalMessage ? finalMessage.concat(chunk) : chunk;
        }

        // 3. 流结束后，检查是否有完整的工具调用
        if (
          !finalMessage ||
          !finalMessage.tool_calls ||
          finalMessage.tool_calls.length === 0
        ) {
          // 没有工具调用，说明 LLM 已经说完了，退出循环
          break;
        }

        // 4. 把拼接完整的 AIMessage 加入历史记录
        messages.push(finalMessage as AIMessage);

        // 5. 执行工具
        for (const toolCall of finalMessage.tool_calls) {
          const toolName = toolCall.name ?? "";
          // 此时 args 已经是被 LangChain 拼接并解析好的完整 JSON 对象
          const toolArgs = toolCall.args ?? {};
          // Ollama 复用的 toolCall.id 就是函数名 → 洗成真 UUID，保证跨 turn 唯一。
          // OpenAI/Anthropic 的 id 已经是真 UUID，跳过覆盖。
          const toolCallId =
            toolCall.id && toolCall.id !== toolName ? toolCall.id : randomUUID();

          yield {
            type: "tool_call",
            data: { id: toolCallId, name: toolName, args: toolArgs },
          };

          const tool = this.toolMap.get(toolName);
          let result: Record<string, unknown>;

          try {
            if (!tool) {
              result = { error: `Unknown tool: ${toolName}` };
            } else {
              const raw = await tool.invoke(toolArgs);
              result =
                typeof raw === "string"
                  ? JSON.parse(raw)
                  : (raw as Record<string, unknown>);
            }
          } catch (err) {
            result = {
              error: err instanceof Error ? err.message : String(err),
            };
          }

          yield {
            type: "tool_result",
            data: { id: toolCallId, name: toolName, result },
          };

          messages.push(
            new ToolMessage({
              tool_call_id: toolCallId,
              name: toolName,
              content: JSON.stringify(result),
            }),
          );
        }
      }

      yield { type: "done", data: {} };
    } catch (err) {
      // 捕获 AbortError：分清是 timeout 还是 client_disconnect，
      // 用 error 事件告知前端，再让 ai.service.ts 走标准 error+done 收尾
      if (err instanceof Error && err.name === "AbortError") {
        const reason = timeoutController.signal.aborted
          ? "timeout"
          : "client_disconnect";
        this.logger.warn(
          `[PlannerAgent] Stream aborted by ${reason} (${STREAM_TIMEOUT_MS}ms timeout)`,
        );
        yield {
          type: "error",
          data: {
            code: "LLM_ABORTED",
            message: `LLM stream aborted (${reason})`,
          },
        };
        return;
      }
      throw err;
    } finally {
      clearTimeout(timeoutTimer);
    }
  }
}
