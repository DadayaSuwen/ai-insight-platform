import { Injectable, Logger } from '@nestjs/common';
import { HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ToolCall } from '@langchain/core/messages/tool';
import { DatabaseService } from '../../database/database.service';
import { SqlAgent } from './sql.agent';
import { ChartAgent } from './chart.agent';
import { AnalysisAgent } from './analysis.agent';
import { LlmService } from '../llm/llm.service';
import {
  createQuerySalesTool,
  createGenChartTool,
  createGenAnalysisTool,
  createSmallTalkTool,
  type PlannerTool,
} from '../tools';

export interface PlannerToolCallData {
  name: string;
  args: Record<string, unknown>;
}

export interface PlannerToolResultData {
  name: string;
  result: Record<string, unknown>;
}

export type PlannerStreamEvent =
  | { type: 'token'; data: { content: string; isFinal: boolean } }
  | { type: 'sql'; data: { sql: string; executed: boolean; rows?: unknown[] } }
  | { type: 'chart'; data: { chartType: string; data: { option: Record<string, unknown>; rows: unknown[] } } }
  | { type: 'analysis'; data: { content: string } }
  | { type: 'error'; data: { code: string; message: string } }
  | { type: 'done'; data: Record<string, never> }
  | { type: 'tool_call'; data: PlannerToolCallData }
  | { type: 'tool_result'; data: PlannerToolResultData }
  | { type: 'thinking'; data: { content: string } };

const PLANNER_SYSTEM_PROMPT = `你是一个智能数据分析助手，拥有四个工具可以调用。

可用工具:
- query_sales: 执行 SQL 查询销售数据，返回查询结果（sql + rows）
- gen_chart: 生成 ECharts 可视化图表配置，返回图表配置+SQL+数据
- gen_analysis: 生成深度分析报告，返回分析文本+SQL+数据
- small_talk: 处理闲聊、问候、帮助类问题

数据库表结构:
{schema}

规则:
1. 如果用户询问数据相关问题（销售额、订单、地区、类别、时间趋势等），调用 query_sales / gen_chart / gen_analysis
2. 如果用户只是闲聊、问候或问怎么使用，调用 small_talk
3. 调用工具后，根据返回结果生成中文自然语言回复
4. 永远不要编造数据，只基于工具返回的真实查询结果
5. 可以按顺序调用多个工具进行多步分析
6. 图表使用 ECharts 配置格式`;

@Injectable()
export class PlannerAgent {
  private readonly logger = new Logger(PlannerAgent.name);
  private readonly toolMap = new Map<string, PlannerTool>();
  private schema: string;
  private readonly chat: BaseChatModel;

  constructor(
    private readonly llm: LlmService,
    private readonly db: DatabaseService,
    private readonly sqlAgent: SqlAgent,
    private readonly chartAgent: ChartAgent,
    private readonly analysisAgent: AnalysisAgent,
  ) {
    // Create tools with injected dependencies
    const querySalesTool = createQuerySalesTool(db, sqlAgent);
    const genChartTool = createGenChartTool(db, sqlAgent, chartAgent);
    const genAnalysisTool = createGenAnalysisTool(db, sqlAgent, analysisAgent);
    const smallTalkTool = createSmallTalkTool(llm);

    this.toolMap.set('query_sales', querySalesTool);
    this.toolMap.set('gen_chart', genChartTool);
    this.toolMap.set('gen_analysis', genAnalysisTool);
    this.toolMap.set('small_talk', smallTalkTool);

    this.schema = this.buildDefaultSchema();

    const baseChat = this.llm.getChatModel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.chat = (baseChat as any).bindTools([...this.toolMap.values()]);

    this.logger.log(
      `PlannerAgent initialized with tools: ${[...this.toolMap.keys()].join(', ')}`,
    );
  }

  private buildDefaultSchema(): string {
    return `Sales: id, productName, category, amount, quantity, region, saleDate, createdAt, updatedAt
ChatSession: id, userId, title, createdAt, updatedAt
ChatMessage: id, sessionId, role, content, metadata, createdAt`;
  }

  async refreshSchema(): Promise<void> {
    try {
      const rows = (await this.db.getSchema()) as Array<{
        table_name: string;
        column_name: string;
        data_type: string;
      }>;

      const tables = new Map<string, string[]>();
      for (const row of rows) {
        const cols = tables.get(row.table_name) ?? [];
        cols.push(`${row.column_name} (${row.data_type})`);
        tables.set(row.table_name, cols);
      }

      const lines: string[] = [];
      for (const [table, cols] of tables) {
        lines.push(`${table}: ${cols.join(', ')}`);
      }
      this.schema = lines.join('\n');
      this.logger.log('Schema refreshed from database');
    } catch (err) {
      this.logger.warn(`Failed to refresh schema: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async *invokeStream(
    message: string,
  ): AsyncGenerator<PlannerStreamEvent, void, unknown> {
    const systemPrompt = PLANNER_SYSTEM_PROMPT.replace('{schema}', this.schema);
    const messages = [
      new SystemMessage(systemPrompt),
      new HumanMessage(message),
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let response: any;

    try {
      response = await this.chat.invoke(messages);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Planner LLM invoke failed: ${msg}`);
      yield { type: 'error', data: { code: 'PLANNER_LLM_FAILED', message: msg } };
      yield { type: 'done', data: {} };
      return;
    }

    // Tool call loop
    while (response.tool_calls && response.tool_calls.length > 0) {
      for (const toolCall of response.tool_calls) {
        const toolName = (toolCall as ToolCall).name ?? '';
        const toolArgs = this.parseToolArgs(toolCall as ToolCall);

        yield {
          type: 'tool_call',
          data: { name: toolName, args: toolArgs },
        };

        const tool = this.toolMap.get(toolName);
        let rawResult: string;
        try {
          if (!tool) {
            rawResult = JSON.stringify({ error: `Unknown tool: ${toolName}` });
          } else {
            rawResult = await tool._call(toolArgs);
          }
        } catch (err) {
          rawResult = JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
          });
        }

        let parsedResult: Record<string, unknown>;
        try {
          parsedResult = JSON.parse(rawResult);
        } catch {
          parsedResult = { raw: rawResult };
        }

        yield {
          type: 'tool_result',
          data: { name: toolName, result: parsedResult },
        };

        messages.push(
          new ToolMessage({
            tool_call_id: (toolCall as ToolCall).id ?? toolName,
            name: toolName,
            content: rawResult,
          }),
        );

        // Emit backward-compatible SSE events
        for (const event of this.emitBackwardCompat(toolName, parsedResult)) {
          yield event;
        }
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        response = await (this.chat.invoke(messages) as any);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Planner LLM invoke (tool result phase) failed: ${msg}`);
        yield { type: 'error', data: { code: 'PLANNER_LLM_FAILED', message: msg } };
        yield { type: 'done', data: {} };
        return;
      }
    }

    if (response.content && typeof response.content === 'string') {
      yield {
        type: 'token',
        data: { content: response.content, isFinal: false },
      };
    }

    yield { type: 'done', data: {} };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseToolArgs(toolCall: ToolCall): Record<string, unknown> {
    const raw = (toolCall as any).args ?? {};
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return { _raw: raw };
      }
    }
    return raw as Record<string, unknown>;
  }

  private emitBackwardCompat(
    toolName: string,
    result: Record<string, unknown>,
  ): PlannerStreamEvent[] {
    const events: PlannerStreamEvent[] = [];

    if (toolName === 'query_sales' || toolName === 'gen_chart' || toolName === 'gen_analysis') {
      const sql = result.sql as string | undefined;
      const rows = result.rows as unknown[] | undefined;
      if (sql && rows) {
        events.push({
          type: 'sql',
          data: { sql, executed: true, rows },
        });
      }
    }

    if (toolName === 'gen_chart') {
      const chart = result.chart as Record<string, unknown> | undefined;
      if (chart) {
        const chartType = String(result.chartType ?? 'bar');
        const rows: unknown[] = (result.rows ?? []) as unknown[];
        const chartEvent = {
          type: 'chart' as const,
          data: {
            chartType,
            data: { option: chart, rows },
          },
        };
        events.push(chartEvent as PlannerStreamEvent);
      }
    }

    if (toolName === 'gen_analysis') {
      const analysis = result.analysis as string | undefined;
      if (analysis) {
        events.push({ type: 'analysis', data: { content: analysis } });
      }
    }

    return events;
  }
}
