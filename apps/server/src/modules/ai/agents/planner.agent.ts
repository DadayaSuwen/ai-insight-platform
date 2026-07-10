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
import { ChartHelper } from "../tools/chart.helper";
import { ChartAgent } from "./chart.agent";
import type { StructuredTool } from "@langchain/core/tools";
import { createQueryDetailsTool } from "../tools/query-details.tool";
import { createGenChartTool } from "../tools/gen-chart.tool";
import { createGenerateInsightTool } from "../tools/generate-insight.tool";
import { createGetTableSchemaTool } from "../tools/get-table-schema.tool";
import { InsightAgent } from "./insight.agent";
import { ToolResultContext } from "../tools/tool-result.context";
import { traceLogger } from "../debug-log";
import { MetadataCacheService } from "../../datasource/metadata/metadata-cache.service";
import { serializeForPrompt } from "../../datasource/security/token-budget";
import { DatasourceService } from "../../datasource/datasource.service";
import { MetadataService } from "../../datasource/metadata/metadata.service";
import { QueryGatewayService } from "../../datasource/query-gateway/query-gateway.service";

/**
 * [Sprint 2] V3 PlannerAgent — 元数据驱动的动态 system prompt
 *
 * 核心改动:
 *   1. 构造器注入 MetadataCacheService + DatasourceService + MetadataService
 *      + QueryGatewayService (全部用于新工具 + 动态 prompt)
 *   2. buildSystemPrompt(dataSourceId) 异步,根据当前 session 的数据源
 *      id 读 MetadataSnapshot → serializeForPrompt(snapshot) → 拼到 prompt
 *   3. 完全删除硬编码的 region/category/month ... 中文 销售数据 schema 描述
 *   4. invokeStream opts 接受 dataSourceId (必填,前端 ChatHeader 注入)
 *   5. 删除 refreshSchema()(不再读整库 information_schema)
 *   6. 工具列表增加 get_table_schema (Sprint 2 新增)
 *   6. 工具列表保持 query_details / gen_chart / generate_insight / get_table_schema
 *      但 factory 改成走 QueryGateway(Sprint 2 重写)
 */
const CHART_KEYWORD_REGEX =
  /(图|占比|分布|趋势|地图|可视化|画|chart|pie|bar|line|柱状|折线|饼|热力|桑基|漏斗|雷达|3D|水球|词云)/i;

const retriedChartForSession = new Set<string>();

export interface PlannerToolCallData {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface PlannerToolResultData {
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

  constructor(
    private readonly llm: LlmService,
    private readonly chartHelper: ChartHelper,
    private readonly chartAgent: ChartAgent,
    private readonly insightAgent: InsightAgent,
    private readonly toolResultContext: ToolResultContext,
    private readonly metadataCache: MetadataCacheService,
    private readonly ds: DatasourceService,
    private readonly metadataService: MetadataService,
    private readonly gateway: QueryGatewayService,
  ) {
    this.logger.log("PlannerAgent initialized (tools built per-invocation)");
  }

  /**
   * [Sprint 5] 每次 invokeStream 调用都重新构造工具,这样每个 tool 闭包
   * 捕获本次的 currentUserId,工具调用时校验 ownership。
   */
  private buildTools(currentUserId: string): StructuredTool[] {
    const queryDetailsTool = createQueryDetailsTool(
      this.ds,
      this.metadataService,
      this.gateway,
      currentUserId,
    );
    const genChartTool = createGenChartTool(
      this.ds,
      this.metadataService,
      this.gateway,
      this.chartHelper,
      this.chartAgent,
      currentUserId,
    );
    const generateInsightTool = createGenerateInsightTool(
      this.insightAgent,
      this.toolResultContext,
    );
    const getTableSchemaTool = createGetTableSchemaTool(
      this.ds,
      this.metadataService,
      this.metadataCache,
      currentUserId,
    );
    return [
      queryDetailsTool,
      genChartTool,
      generateInsightTool,
      getTableSchemaTool,
    ];
  }

  private getChat(tools: StructuredTool[]) {
    const baseChat = this.llm.getChatModel();
    return baseChat.bindTools(tools);
  }

  /**
   * [Sprint 2] 动态构建 system prompt:
   *   - 读取 MetadataCache.get(dataSourceId) → MetadataSnapshot
   *   - serializeForPrompt(snapshot) 走 token-budget
   *   - 把序列化结果嵌入 prompt 的"数据源 schema"段
   *
   * 严禁硬编码业务列名。如果发现 prompt 含具体表/列,会让 LLM 看到
   * "幻觉字段"。
   */
  private async buildSystemPrompt(
    dataSourceId: string,
    tools: StructuredTool[],
  ): Promise<string> {
    // 1. 取 snapshot (cache hit → 0 cost)
    const snapshot = this.metadataCache.get(dataSourceId);
    const serialized = snapshot
      ? serializeForPrompt(snapshot).text
      : `(正在加载 ${dataSourceId} 的 schema…`;

    // 2. 工具描述 (动态从 Zod schema 抽)
    const toolNames = [
      "query_details",
      "gen_chart",
      "generate_insight",
      "get_table_schema",
    ];
    const toolDescs = tools
      .map((t, i) => `- ${toolNames[i] ?? t.name}: ${t.description}`)
      .join("\n");

    // [Sprint 2] 完全重写。零硬编码业务列名。
    return `你是一个极其专业的企业级数据分析师。当前会话的数据源: ${dataSourceId}。

${serialized}

可用工具:
${toolDescs}

【工具选用指引】
- 简单聚合/概览/统计 → query_details (table + groupBy + metrics)
- Top-N / 明细行 / 利润分析 / 任意维度聚合 → query_details
- 可视化图表 → gen_chart (与 query_details 同构, 输出行 + ChartIntent)
- **商业洞察（默认开启）**: **每次**调用 query_details 或 gen_chart 拿到数据后，**必须紧接着调用 generate_insight** 给用户提供数据洞察。这是硬性要求，除非用户明确说"不要分析"、"只要数据"。数据 + 洞察是一体的，不要只给数据不给洞察
- **Schema 探索**:若 MetadataSnapshot 中某张表只有表名没有完整列,调 get_table_schema (dataSourceId, table) 拿全量字段

【物理名隔离规则 (CRITICAL — Sprint 5.7)】
- 查询意图 (QueryIntent) 中的 table、groupBy、metrics.column、filters.column **必须使用物理列名**（如 emp_name），绝对不能使用中文名
- 括号中的中文名（chineseName）仅用于帮你理解字段的业务含义，不是合法的查询参数
- 如果你误用中文名，会收到 IntentValidationError，届时请调 get_table_schema 确认正确的物理名并修正

【QueryIntent 字段约定】
- dataSourceId: 始终传当前会话的 ${dataSourceId}(前端会自动注入)
- table: 从上方 MetadataSnapshot 中选取
- groupBy: 列名数组(字符串),空数组 = 明细模式
- metrics: [{column, agg (SUM/AVG/COUNT/COUNT_DISTINCT/MIN/MAX), alias, label}]
- filters: [{column, op (=,!=,>,<,>=,<=,IN,LIKE,BETWEEN), value}]
- topN: 1-100 (明细模式强 ≤ 50)

【样式/地图/布局】(gen_chart 专属):
- 用户说颜色 → colorPalette 数组
- 用户说地图类型 → mapType
- 用户说"全屏/大屏" → layout: "fullscreen"

【硬性规则】
1. **绝对禁止编造数据**:所有数字必须来自 query_details / gen_chart 工具返回。
2. **禁止 ASCII 图表**:用户提到可视化 → 必须调 gen_chart。
3. **每次查询必须链式生成洞察**: 调用 query_details 或 gen_chart 拿到数据后，必须紧接着调用 generate_insight。数据+洞察是一体的流程。除非用户明确说"不要分析"，否则这条规则不可跳过。
4. **不要硬编码 SQL**:不要在 prompt 里写 SELECT / FROM / WHERE 字符串 — 通过 QueryIntent 表达。
5. 字段名错时 → 收到 IntentValidationError 后,先调 get_table_schema 拿正确字段,再重试。
6. 多轮复用上一次结果:若用户问"按 category 统计,但只要家具类",基于上一轮的 query_details 结果 + 新增 filter 调,而不是重新查询全量。
7. 回复用 Markdown (##/### 标题, **加粗** 关键数字, - 列表),如麦肯锡商业报告。
8. **物理名优先 (Sprint 5.7)**：所有工具参数中的列名、表名必须是物理名，不是中文名。中文字段名仅供理解。

【工具协同模式示例（洞察是必须的）】
- 用户问"本月销售额" →
   query_details(...) → 拿到 rows →
   generate_insight(question="分析本月销售数据", data=上一步的 rows)  ← 不能跳过！
- "本月订单趋势,画图" →
   gen_chart(...) → 拿到 chart + rows →
   generate_insight(question=..., data=rows)  ← 不能跳过！
- "查某张表有哪些字段" → get_table_schema(dataSourceId, table=<表名>)（仅 schema 探索无需洞察）
`;
  }

  /**
   * [Sprint 2] 兼容老调用 — refreshSchema() 现在是 no-op,
   * metadata 是按需从 cache 读取,不再整库扫描。
   * 保留 API 防止 ai.service.ts 编译失败(Sprint 2 也已不再调它)。
   */
  async refreshSchema(): Promise<void> {
    return;
  }

  private extractContent(content: AIMessage["content"]): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map(part => {
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

  private extractReasoning(chunk: AIMessageChunk): string {
    const v = (chunk as any).additional_kwargs?.reasoning_content;
    return typeof v === "string" ? v : "";
  }

  async *invokeStream(
    message: string,
    history: BaseMessage[] = [],
    opts: {
      signal?: AbortSignal;
      sessionId?: string;
      dataSourceId?: string;
      currentUserId?: string; // [Sprint 5]
    } = {},
  ): AsyncGenerator<PlannerStreamEvent, void, unknown> {
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
      const dataSourceId = opts.dataSourceId ?? "";
      // [Sprint 5] 用 session 关联的 userId,不是从历史 dataSourceId 推断
      const currentUserId = opts.currentUserId ?? "anonymous";

      // [Sprint 5.7] 强制 dataSourceId 校验 — 不能让 LLM 盲猜
      if (!dataSourceId) {
        yield {
          type: "error",
          data: {
            code: "NO_DATASOURCE",
            message:
              "当前会话未绑定数据源，请先在设置中选择数据源后再提问。",
          },
        };
        return;
      }

      // [Sprint 5.7] 预热 snapshot — 确保 LLM 看到完整 schema，不是"正在加载..."
      if (!this.metadataCache.get(dataSourceId)) {
        try {
          await this.metadataService.get(dataSourceId);
          this.logger.log(
            `[Sprint 5.7] Snapshot warmed for dataSourceId=${dataSourceId}`,
          );
        } catch (err) {
          // [Sprint 5.7] 诊断：列出当前用户可用的数据源
          let availableList = "";
          try {
            const allDS = await this.ds.listForUser(currentUserId);
            availableList = allDS.length > 0
              ? ` 当前可用的数据源: [${allDS.map(d => `${d.id} (${d.name})`).join(", ")}]`
              : " 当前没有任何已注册的数据源，请先上传 CSV 或连接数据库。";
          } catch { /* ignore */ }

          yield {
            type: "error",
            data: {
              code: "SNAPSHOT_EMPTY",
              message: `数据源 ${dataSourceId} 的元数据加载失败: ${(err as Error).message}。${availableList}`,
            },
          };
          return;
        }
      }

      const tools = this.buildTools(currentUserId);
      const systemPrompt = await this.buildSystemPrompt(dataSourceId, tools);

      const messages: BaseMessage[] = [
        new SystemMessage(systemPrompt),
        ...history,
        new HumanMessage(message),
      ];

      let iterations = 0;

      while (true) {
        iterations++;
        if (iterations > MAX_ITERATIONS) {
          this.logger.warn(`Max iterations (${MAX_ITERATIONS}) reached, forcing stop`);
          yield {
            type: "error",
            data: {
              code: "MAX_ITERATIONS_REACHED",
              message: `已尝试 ${MAX_ITERATIONS} 次,仍无法完成请求,请尝试换一种问法。`,
            },
          };
          yield { type: "done", data: {} };
          return;
        }

        const stream = await this.getChat(tools).stream(messages, {
          signal: combinedSignal,
        });

        let finalMessage: AIMessageChunk | undefined;

        for await (const chunk of stream) {
          if (combinedSignal.aborted) {
            const reason = timeoutController.signal.aborted ? "timeout" : "client_disconnect";
            this.logger.log(`[PlannerAgent] Stream aborted (${reason})`);
            return;
          }
          const content = this.extractContent(chunk.content);
          if (content) {
            yield { type: "text", data: { content } };
          }
          finalMessage = finalMessage ? finalMessage.concat(chunk) : chunk;
        }

        if (
          !finalMessage ||
          !finalMessage.tool_calls ||
          finalMessage.tool_calls.length === 0
        ) {
          const sessionKey = opts.sessionId ?? "default";
          if (
            CHART_KEYWORD_REGEX.test(message) &&
            !retriedChartForSession.has(sessionKey)
          ) {
            retriedChartForSession.add(sessionKey);
            this.logger.warn(
              `[M9-Bug B] session ${sessionKey} planner returned 0 tool_call but user message contains chart keyword; injecting hint and retrying once`,
            );
            if (finalMessage) messages.push(finalMessage as AIMessage);
            messages.push(
              new HumanMessage(
                "[系统提示] 你刚才没有调用任何工具,但用户消息包含图表/可视化/颜色/地图/布局关键词。" +
                  "**你必须调用 gen_chart 工具**;用户指定的颜色、地图类型、布局意图会自动由后端 ChartAgent 识别。" +
                  "**严禁用 ASCII 字符手绘图表** — 那会被前端视为渲染失败并降级为表格。",
              ),
            );
            continue;
          }
          retriedChartForSession.delete(sessionKey);
          break;
        }

        messages.push(finalMessage as AIMessage);

        for (const toolCall of finalMessage.tool_calls) {
          const toolName = toolCall.name ?? "";
          const toolArgs = toolCall.args ?? {};
          const toolCallId =
            toolCall.id && toolCall.id !== toolName
              ? toolCall.id
              : randomUUID();

          yield {
            type: "tool_call",
            data: { id: toolCallId, name: toolName, args: toolArgs },
          };

          const tool = tools.find(t => t.name === toolName);
          let result: Record<string, unknown>;

          try {
            if (!tool) {
              result = { error: `Unknown tool: ${toolName}` };
            } else {
              // [Sprint 2] 自动注入 dataSourceId
              const argsWithContext = {
                ...toolArgs,
                dataSourceId:
                  (toolArgs as { dataSourceId?: string }).dataSourceId ??
                  dataSourceId,
                ...(toolName === "generate_insight" && opts.sessionId
                  ? { sessionId: opts.sessionId }
                  : {}),
                ...(toolName === "gen_chart" && message
                  ? {
                      originalMessage: message,
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
            traceLogger.trace({
              phase: "tool-call",
              ctx: { toolName, toolCallId, args: toolArgs },
              err,
              level: "error",
            });
            result = {
              error: err instanceof Error ? err.message : String(err),
            };
          }

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
      if (err instanceof Error && err.name === "AbortError") {
        const reason = timeoutController.signal.aborted
          ? "timeout"
          : "client_disconnect";
        this.logger.warn(
          `[PlannerAgent] Stream aborted by ${reason} (${STREAM_TIMEOUT_MS}ms timeout)`,
        );
        yield {
          type: "error",
          data: { code: "LLM_ABORTED", message: `LLM stream aborted (${reason})` },
        };
        return;
      }
      throw err;
    } finally {
      clearTimeout(timeoutTimer);
    }
  }
}