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
   * LangChain 0.3.x bindTools() 接受 StructuredTool[] 数组，
   * ChatOpenAI / ChatAnthropic 会自动处理 tool_calls 协议格式。
   */
  private getChat() {
    const baseChat = this.llm.getChatModel();
    const tools = [...this.toolMap.values()];

    return baseChat.bindTools(tools);
  }

  private buildDefaultSchema(): string {
    // 兜底：refreshSchema 失败时，planner 仍然能工作。
    // 通过 getSchema() 动态拿真实 4 张业务表；若 DB 查询也失败，降到空串。
    return "";
  }

  /**
   * 业务表白名单——LLM 只能看这 4 张表，ChatSession/ChatMessage/LLMConfig
   * 是系统内部表，给 LLM 看会污染上下文并增加幻觉。
   */
  private static readonly BUSINESS_TABLES = new Set([
    "Customer",
    "Product",
    "SalesOrder",
    "SalesOrderItem",
  ]);

  async refreshSchema(): Promise<void> {
    try {
      const rows = (await (this.db as any).getSchema?.()) as Array<{
        table_name: string;
        column_name: string;
        data_type: string;
        is_nullable: string;
      }> | undefined;

      const pkMap: Map<string, string[]> =
        ((await (this.db as any).getPrimaryKeys?.()) as
          | Map<string, string[]>
          | undefined) ?? new Map();

      if (!rows) return;

      // 按白名单过滤 + 按表名分组
      const tables = new Map<string, Array<{ col: string; type: string; nullable: boolean; isPk: boolean }>>();
      for (const row of rows) {
        if (!PlannerAgent.BUSINESS_TABLES.has(row.table_name)) continue;
        const pkSet = new Set(pkMap.get(row.table_name) ?? []);
        const cols = tables.get(row.table_name) ?? [];
        cols.push({
          col: row.column_name,
          type: row.data_type,
          nullable: row.is_nullable === "YES",
          isPk: pkSet.has(row.column_name),
        });
        tables.set(row.table_name, cols);
      }

      // 固定顺序输出，方便日志对比
      const lines: string[] = [];
      for (const tableName of [...PlannerAgent.BUSINESS_TABLES]) {
        const cols = tables.get(tableName);
        if (!cols) continue;
        const colDescs = cols
          .map((c) => {
            const tags: string[] = [];
            if (c.isPk) tags.push("PK");
            if (c.nullable) tags.push("NULL");
            const tagStr = tags.length > 0 ? ` [${tags.join(",")}]` : "";
            return `${c.col} (${c.type})${tagStr}`;
          })
          .join(", ");
        lines.push(`${tableName}: ${colDescs}`);
      }
      this.schema = lines.join("\n");
      this.logger.log(
        `Schema refreshed from database (${tables.size} business tables):\n${this.schema}`,
      );
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

【绝对红线——工具调用规则，最高优先级，违反任一条即视为错误】:
1. **绝对禁止**在文本中描述你将要调用的工具。禁止输出"我将使用XX工具"、"接下来我调用XX"、"让我查一下"、"我先获取一下"等任何前瞻性废话。
2. 如果你需要使用工具，**直接输出工具调用**，不要附带任何解释性文字（content 字段必须为空字符串）。
3. **只有在不使用任何工具、直接回答用户问题时，才输出文本**。一旦决定调工具，content 必须空。
4. 严禁"只说不做"：不要在文本里叙述你会调用工具，但实际不调用。如果你描述了工具调用，那次调用必须真实发生。

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
  ): AsyncGenerator<PlannerStreamEvent, void, unknown> {
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

      const stream = await this.getChat().stream(messages);

      // ★ 使用 AIMessageChunk 累积流式碎片
      let finalMessage: AIMessageChunk | undefined;
      // ★ 单轮 text 缓冲：等本轮流结束再决定是否 yield 给前端
      // 中间轮（即将调工具）的 text 不暴露给用户，但保留在 messages 数组里
      // 维持 LLM 上下文记忆。
      let currentTurnTextBuffer = "";

      for await (const chunk of stream) {
        // 1. 累积本轮 text 到 buffer（不 yield；轮末再决定）
        const content = this.extractContent(chunk.content);
        if (content) {
          currentTurnTextBuffer += content;
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
        // 情况 A: 最终总结轮 → 把整轮 text yield 出去给前端
        if (currentTurnTextBuffer.length > 0) {
          yield {
            type: "text",
            data: { content: currentTurnTextBuffer },
          };
        }
        // 仍要把 AIMessage 放进历史，保证多轮对话上下文一致
        messages.push(new AIMessage(currentTurnTextBuffer));
        // 没有工具调用，说明 LLM 已经说完了，退出循环
        break;
      }

      // 情况 B: 中间工具调用轮 → 整轮 text 不 yield 给前端
      // 但**必须**把它作为 AIMessage content 放进 messages 数组
      // （保留 LLM 上下文记忆），并通过 'thinking' 事件传给 chat.service.ts
      // 存到 metadata.thinking 供调试。
      messages.push(new AIMessage(currentTurnTextBuffer));
      if (currentTurnTextBuffer.length > 0) {
        yield {
          type: "thinking",
          data: { content: currentTurnTextBuffer },
        };
      }

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
