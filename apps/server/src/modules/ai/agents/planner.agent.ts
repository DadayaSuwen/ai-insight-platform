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
  /** 稳定 UUID（chat.service.ts 注入），跨 turn 全局唯一；用于 AIMessage.tool_calls[].id 与 ToolMessage.tool_call_id 严格配对 */
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface PlannerToolResultData {
  /** 同 PlannerToolCallData.id —— 由 chat.service 替换为稳定 UUID */
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
  | { type: "thinking"; data: { content: string } }
  | { type: "reasoning"; data: { content: string } };

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

  /**
   * 从 AIMessageChunk 中提取 Qwen3 / DeepSeek-R1 等思考模型的 reasoning_content。
   * 通过 ThinkingChatOllama 子类，thinking 已经被写入 additional_kwargs.reasoning_content。
   */
  private extractReasoning(chunk: AIMessageChunk): string {
    const v = (chunk as any).additional_kwargs?.reasoning_content;
    if (typeof v === "string") return v;
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

    // ★ 跨 turn 全局唯一的 id 注入器：
    // planner 内部推入 messages 数组的 AIMessage.tool_calls[].id / ToolMessage.tool_call_id
    // 以及 yield 给 chat.service 的 tool_call/tool_result 事件，都用 chat.service 注入的 UUID。
    // 这样：
    //   1. Ollama 函数名复用问题彻底根除（同一函数名跨 turn id 也不同）
    //   2. planner 内部 messages 数组与 DB metadata.toolCalls[].id 完全一致
    //   3. 下一轮重建历史时不需要任何 id 替换
    // 用 generator function 闭包确保每次 next() 都拿到新 UUID，跨 turn 全局唯一
    let idCounter = 0;
    const idGenerator = () => `${randomUUID()}-${idCounter++}`;

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
      // ★ 推理内容缓冲：Qwen3 / DeepSeek-R1 等思考模型的 reasoning_content。
      // ThinkingChatOllama 子类把 thinking 写入 additional_kwargs.reasoning_content。
      // 多轮对话必须回传（Qwen3 API 校验），因此无论本轮是否最终总结，都要进 AIMessage。
      let currentTurnReasoningBuffer = "";

      for await (const chunk of stream) {
        // 1. 累积本轮 text 到 buffer（不 yield；轮末再决定）
        const content = this.extractContent(chunk.content);
        if (content) {
          currentTurnTextBuffer += content;
        }

        // 2. 累积 reasoning_content（每个 chunk 是一段 reasoning 流式片段）
        const reasoning = this.extractReasoning(chunk);
        if (reasoning) {
          currentTurnReasoningBuffer += reasoning;
        }

        // 3. 累积合并 chunk，LangChain 底层会自动拼好 tool_calls 的 args
        finalMessage = finalMessage ? finalMessage.concat(chunk) : chunk;
      }

      // 4. 流结束后，检查是否有完整的工具调用
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
        // ★ reasoning_content 也必须进入 messages 数组（Qwen3 多轮校验）
        messages.push(
          new AIMessage({
            content: currentTurnTextBuffer,
            additional_kwargs:
              currentTurnReasoningBuffer.length > 0
                ? { reasoning_content: currentTurnReasoningBuffer }
                : {},
          }),
        );
        if (currentTurnReasoningBuffer.length > 0) {
          yield {
            type: "reasoning",
            data: { content: currentTurnReasoningBuffer },
          };
        }
        // 没有工具调用，说明 LLM 已经说完了，退出循环
        break;
      }

      // 情况 B: 中间工具调用轮 → 整轮 text 不 yield 给前端
      // 但**必须**把 text + tool_calls 作为**同一个** AIMessage 放进 messages 数组
      // ——LangChain 严格要求 ToolMessage 的 tool_call_id 在它之前最近的 AIMessage.tool_calls[].id 里存在。
      // 把 text 单独拆成不含 tool_calls 的 AIMessage 会导致 400 "tool must be a response to a preceding message with 'tool_calls'"。
      // 把整轮 text 通过 'thinking' 事件透传给 chat.service.ts 存到 metadata.thinking 供调试。
      // ★ reasoning_content 通过 additional_kwargs 持久化（多轮对话 + DB 落库都用）
      // ★ 用 planner 自己的 idGenerator 生成稳定 UUID（避免 Ollama 函数名复用）
      const toolCallsForMessage = finalMessage.tool_calls.map((tc) => {
        const id = idGenerator();
        return {
          id,
          name: tc.name ?? "",
          args: tc.args ?? {},
          type: "tool_call" as const,
        };
      });

      messages.push(
        new AIMessage({
          content: currentTurnTextBuffer,
          tool_calls: toolCallsForMessage,
          additional_kwargs:
            currentTurnReasoningBuffer.length > 0
              ? { reasoning_content: currentTurnReasoningBuffer }
              : {},
        }),
      );
      if (currentTurnReasoningBuffer.length > 0) {
        // ★ 把 reasoning_content 透传给 chat.service.ts 落库（供多轮对话重建）。
        // 注意：前端不展示 reasoning（仅 metadata 调试用），与 'thinking' 事件分开。
        yield {
          type: "reasoning",
          data: { content: currentTurnReasoningBuffer },
        };
      }
      if (currentTurnTextBuffer.length > 0) {
        yield {
          type: "thinking",
          data: { content: currentTurnTextBuffer },
        };
      }

      // 5. 执行工具（按 AIMessage.tool_calls 的顺序，复用同一 UUID 保证 ToolMessage.tool_call_id 严格配对）
      for (let i = 0; i < finalMessage.tool_calls.length; i++) {
        const toolCall = finalMessage.tool_calls[i];
        const toolCallMeta = toolCallsForMessage[i];
        const toolName = toolCall.name ?? "";
        // 此时 args 已经是被 LangChain 拼接并解析好的完整 JSON 对象
        const toolArgs = toolCall.args ?? {};
        // 复用 AIMessage.tool_calls[i].id（planner 生成的稳定 UUID）
        const toolCallId = toolCallMeta.id;

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
          result = { error: err instanceof Error ? err.message : String(err) };
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
  }
}
