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
import { ChartAgent } from "./chart.agent";
import type { StructuredTool } from "@langchain/core/tools";
import { createQuerySalesTool, createGenChartTool } from "../tools";
import { createQueryDetailsTool } from "../tools/query-details.tool";
import { createGenerateInsightTool } from "../tools/generate-insight.tool";
import { InsightAgent } from "./insight.agent";
import { ToolResultContext } from "../tools/tool-result.context";
import { traceLogger } from "../debug-log";

/**
 * [M9-Bug B Step 2+3] 图表关键词正则 + session 维度重试标记
 *
 * 当 Planner 输出纯文本(0 tool_call)但用户消息含图表关键词时,
 * 注入 System 提示强制要求调用 gen_chart。同一 session 只重试 1 次,避免死循环。
 */
const CHART_KEYWORD_REGEX =
  /(图|占比|分布|趋势|地图|可视化|画|chart|pie|bar|line|柱状|折线|饼|热力|桑基|漏斗|雷达|3D|水球|词云)/i;

/** sessionId → 是否已重试过 (避免死循环) */
const retriedChartForSession = new Set<string>();

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
    private readonly chartHelper: ChartHelper,
    private readonly chartAgent: ChartAgent,
    // [M13-V2] ChartValidator 删除 — V2 装配确定性,无需校验器
    private readonly insightAgent: InsightAgent,
    private readonly toolResultContext: ToolResultContext,
  ) {
    const querySalesTool = createQuerySalesTool(this.db);
    const queryDetailsTool = createQueryDetailsTool(this.db);
    const genChartTool = createGenChartTool(
      this.db,
      this.chartHelper,
      this.chartAgent,
    );
    const generateInsightTool = createGenerateInsightTool(
      this.insightAgent,
      this.toolResultContext,
    );

    this.toolMap.set("query_sales", querySalesTool);
    this.toolMap.set("query_details", queryDetailsTool);
    this.toolMap.set("gen_chart", genChartTool);
    this.toolMap.set("generate_insight", generateInsightTool);

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

【何时使用哪个工具】(关键 — 选错工具 = 答非所问):
- 简单聚合 / 总览 (按月/类别/地区 总额销量) → query_sales
- Top-N / 明细行 / 利润分析 / 任意维度聚合 (州/客户/子类别/客户类型/运输方式/按日按周按季) → query_details
- 可视化图表 → gen_chart
- **商业洞察 / 原因分析 / 风险机会 / "为什么" / "分析一下" / "总结一下"** → **必须先 query_sales 或 query_details 拿到数据,然后立即调用 generate_insight**。不要只在文本里总结 — 那叫"描述",不叫"洞察"。

【样式/地图/布局意图】(M5-Patch — 严禁 ASCII 画图):
- 用户提到颜色 ("紫色" / "蓝色系" / "用红色" / "#ff0000") → 调 gen_chart 时**必须传 colorPalette** (中文色名后端自动转 hex)
- 用户提到地图类型 ("中国地图" / "世界地图" / "广东省") → 调 gen_chart 时**必须传 mapType**
- 用户说 "全屏展示" / "大屏" / "铺满" → 调 gen_chart 时**必须传 layout: "fullscreen"**
- **严禁用 ASCII 字符、Unicode 方块、Markdown 表格模拟图表**;图表生成是 gen_chart 工具的职责,后端会自动注入用户指定的样式。

【重要规则】:
1. 询问数据 → 必须用 query_sales 或 query_details,**绝对禁止编造数据**。
2. 画图 → 必须 gen_chart,**绝对禁止 ASCII 手绘**。
3. 工具返回无法满足细节要求 → 基于现有数据总结,严禁说"因工具限制无法获取"。
4. 回复用 Markdown (\`##\`/\`###\` 标题, \`**加粗**\` 关键数字, \`-\` 列表),像麦肯锡商业报告。
5. 【格式红线】前端已自动把工具返回的 summary / rows 渲染成精美表格。**禁止用 Markdown 表格语法 (|---|---) 重复展示相同数据**。你只负责自然语言分析。
6. generate_insight 是关键差异化能力。当用户问"为什么"、"分析一下"、"有什么风险"、"给我洞察"、"总结"时:**数据查询完后必须紧接着调用 generate_insight**,让专业的二次 LLM pass 抽取洞察卡片。不要自己敷衍总结。
7. 多工具协同模式 (示例):
   - "Top 10 客户按销售额,分析风险" → query_details(groupBy=customer, metrics=[sales,profit]) → generate_insight(question=..., data=上一步结果)
   - "本月销售,画图,给洞察" → query_sales(month) → gen_chart(same) → generate_insight(question=..., data=query_sales 结果)
8. generate_insight 的 data 参数如果留空,系统会自动从最近的 query_sales / query_details 结果补全。但**显式传 data 更稳**。`;
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
    opts: { signal?: AbortSignal; sessionId?: string } = {},
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
      const MAX_ITERATIONS = Number(process.env.MAX_ITERATIONS ?? 30);
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
          // [M9-Bug B Step 2+3] 0 tool_call 后置防御: 用户消息含图表关键词但 planner 没调工具 → 注入 System 提示 + 重试 1 次
          const sessionKey = opts.sessionId ?? "default";
          if (
            CHART_KEYWORD_REGEX.test(message) &&
            !retriedChartForSession.has(sessionKey)
          ) {
            retriedChartForSession.add(sessionKey);
            this.logger.warn(
              `[M9-Bug B] session ${sessionKey} planner returned 0 tool_call but user message contains chart keyword; injecting hint and retrying once`,
            );
            // 把当前 finalMessage (纯 text) 也保留进 messages,让 LLM 看到自己刚才的回答
            if (finalMessage) messages.push(finalMessage as AIMessage);
            // [M10-Bug E 修复] LangChain 协议硬性要求 SystemMessage 必须是 messages[0],
            //   中间插入会抛 "System messages are only permitted as the first passed message"。
            //   改用 HumanMessage 模拟"用户追问"语气,LLM 视为强诉求。
            messages.push(
              new HumanMessage(
                // [M5-Patch-Fix] 收紧:用户消息含图表/样式关键词时,严禁 ASCII 兜底
                "[系统提示] 你刚才没有调用任何工具,但用户消息包含图表/可视化/颜色/地图/布局关键词。" +
                  "**你必须调用 gen_chart 工具**;用户指定的颜色、地图类型、布局意图会自动由后端 ChartAgent 识别。" +
                  "**严禁用 ASCII 字符手绘图表** — 那会被前端视为渲染失败并降级为表格。",
              ),
            );
            continue; // 回到 while(true) 顶部重试
          }
          // 没有工具调用 / 已重试过 → 退出循环
          retriedChartForSession.delete(sessionKey); // 清理本次 session 的标记
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
            toolCall.id && toolCall.id !== toolName
              ? toolCall.id
              : randomUUID();

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
              // ★ 运行时上下文注入 (不会回传给 LLM,工具内部识别并使用):
              //   - generate_insight: sessionId 用于 ToolResultContext 兜底
              //   - gen_chart: originalMessage 用于 ChartAgent 生成上下文相关标题
              //   - [M6-L3] gen_chart: sessionId 用于 ChartAgent 失败计数隔离 (意图直出降级)
              const argsWithContext = {
                ...toolArgs,
                ...(toolName === "generate_insight" && opts.sessionId
                  ? { sessionId: opts.sessionId }
                  : {}),
                ...(toolName === "gen_chart" && message
                  ? {
                      originalMessage: message,
                      // [M6-L3] sessionId 注入到 gen_chart args (供 ChartAgent 失败计数)
                      ...(opts.sessionId ? { sessionId: opts.sessionId } : {}),
                    }
                  : {}),
              };
              const raw = await tool.invoke(argsWithContext);
              result =
                typeof raw === "string"
                  ? JSON.parse(raw)
                  : (raw as Record<string, unknown>);
            }
          } catch (err) {
            // [M7] 工具 invoke 失败 → traceLogger.trace (之前完全无日志)
            traceLogger.trace({
              phase: "tool-call",
              ctx: {
                toolName,
                toolCallId,
                args: toolArgs,
              },
              err,
              level: "error",
            });
            result = {
              error: err instanceof Error ? err.message : String(err),
            };
          }

          // ★ 推入 ToolResultContext (给 generate_insight 兜底用)
          if (opts.sessionId && toolName !== "generate_insight") {
            this.toolResultContext.push(
              opts.sessionId,
              toolCallId,
              toolName,
              result,
            );
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
