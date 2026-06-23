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
import { LlmService } from "../llm/llm.service";
import { DatabaseService } from "../../database/database.service";
import { ChartHelper } from "../tools/chart.helper";
import type { StructuredTool } from "@langchain/core/tools";
import { createQuerySalesTool, createGenChartTool } from "../tools";

export interface PlannerToolCallData {
  name: string;
  args: Record<string, unknown>;
}

export interface PlannerToolResultData {
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

    return `你是一个智能数据分析助手。

可用工具:
 ${toolDescs}

数据库表结构:
 ${this.schema}

规则:
1. 如果用户询问数据相关问题（销售额、订单量、地区、类别、时间趋势等），调用 query_sales
2. 如果用户要求生成图表（柱状图、折线图、饼图等），调用 gen_chart
3. 永远不要编造数据，只基于工具返回的真实查询结果
4. 收到查询结果后，用中文自然语言回复用户
5. 最多调用 5 次工具，超过则停止并告知用户`;
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
  ): AsyncGenerator<PlannerStreamEvent, void, unknown> {
    const MAX_ITERATIONS = 5;
    const systemPrompt = this.buildSystemPrompt();
    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt),
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

      const stream = await this.getChat().stream(messages);

      // ★ 使用 AIMessageChunk 累积流式碎片
      let finalMessage: AIMessageChunk | undefined;

      for await (const chunk of stream) {
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

        yield {
          type: "tool_call",
          data: { name: toolName, args: toolArgs },
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
          result = { error: err instanceof Error ? err.message : String(err) };
        }

        yield {
          type: "tool_result",
          data: { name: toolName, result },
        };

        messages.push(
          new ToolMessage({
            tool_call_id: toolCall.id ?? toolName,
            name: toolName,
            content: JSON.stringify(result),
          }),
        );
      }
    }

    yield { type: "done", data: {} };
  }
}
