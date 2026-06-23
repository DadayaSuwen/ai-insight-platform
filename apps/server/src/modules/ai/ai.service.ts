import { Injectable, Logger } from '@nestjs/common';
import { RouterAgent, IntentType } from './agents/router.agent';
import { SqlAgent } from './agents/sql.agent';
import { ChartAgent, EChartsOption } from './agents/chart.agent';
import { AnalysisAgent } from './agents/analysis.agent';
import { DatabaseService } from '../database/database.service';
import { LlmService } from './llm/llm.service';
import {
  SSEEventType,
  SSETokenData,
  SSESQLData,
  SSEChartData,
  SSEAnalysisData,
  SSEErrorData,
} from '@workspace/types';

/**
 * System prompt for the catch-all chat branch. Kept short — it's used
 * only when the router decides the user is just chatting.
 */
const CHAT_SYSTEM_PROMPT = `你是 AI Insight Platform 的智能助手。你的主要能力是:
1. 帮用户查询和分析销售数据
2. 把查询结果生成图表(柱状图、折线图、饼图等)
3. 基于数据生成深度分析报告

回答时:
- 用中文,简洁友好
- 如果用户问的是数据相关问题,引导他们用具体业务语言,例如"显示按类别销售额"
- 不知道就说不知道,不要编造`;

/**
 * Partial SSE event emitted during streaming.
 * Used by the streaming pipeline (processMessageStream).
 */
export interface AiStreamEvent {
  type: 'token' | 'sql' | 'chart' | 'analysis' | 'error' | 'done';
  data: SSETokenData | SSESQLData | SSEChartData | SSEAnalysisData | SSEErrorData | Record<string, never>;
}

/**
 * Structured result returned by AiService.process().
 *
 * The SSE controller (Phase 4) maps this to SSE events.
 * Keeping the return type rich-but-sync lets us test orchestration
 * in isolation from streaming concerns.
 */
export interface AiProcessResult {
  intent: IntentType;
  /** User-facing text (token payload) */
  message: string;
  sql?: string;
  executed?: boolean;
  rows?: unknown[];
  chart?: EChartsOption;
  analysis?: string;
  error?: { code: string; message: string };
}

/**
 * AiService - Pipeline Orchestrator
 *
 * 串联 RouterAgent → SqlAgent → DatabaseService → ChartAgent / AnalysisAgent
 *
 * The chat branch now goes through LlmService directly so casual
 * conversation (greetings, help questions) feels natural instead of
 * returning a canned string.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly routerAgent: RouterAgent,
    private readonly sqlAgent: SqlAgent,
    private readonly chartAgent: ChartAgent,
    private readonly analysisAgent: AnalysisAgent,
    private readonly databaseService: DatabaseService,
    private readonly llm: LlmService,
  ) {}

  /**
   * Process a user message end-to-end.
   */
  async process(message: string): Promise<AiProcessResult> {
    this.logger.log(`Processing message: ${message}`);

    let intent: IntentType;
    try {
      intent = await this.routerAgent.recognize(message);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Intent recognition failed: ${msg}`);
      return this.errorResult('INTENT_FAILED', msg);
    }

    this.logger.log(`Intent: ${intent}`);

    try {
      switch (intent) {
        case 'chat':
          return await this.handleChat(message);
        case 'sql':
          return await this.handleSql(message);
        case 'chart':
          return await this.handleChart(message);
        case 'analysis':
          return await this.handleAnalysis(message);
        default:
          return await this.handleChat(message);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Pipeline failed at intent=${intent}: ${msg}`);
      return this.errorResult('PIPELINE_FAILED', msg, intent);
    }
  }

  /**
   * Streaming version of process — yields SSE events as they become available.
   * The chat intent streams tokens in real-time from the LLM.
   * Other intents execute synchronously but still yield events sequentially.
   */
  async *processStream(
    message: string,
  ): AsyncGenerator<AiStreamEvent, void, unknown> {
    this.logger.log(`[stream] Processing message: ${message}`);

    let intent: IntentType;
    try {
      intent = await this.routerAgent.recognize(message);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[stream] Intent recognition failed: ${msg}`);
      yield this.errorEvent('INTENT_FAILED', msg);
      return;
    }

    this.logger.log(`[stream] Intent: ${intent}`);

    try {
      switch (intent) {
        case 'chat':
          yield* this.handleChatStream(message);
          break;
        case 'sql':
          yield* this.handleSqlStream(message);
          break;
        case 'chart':
          yield* this.handleChartStream(message);
          break;
        case 'analysis':
          yield* this.handleAnalysisStream(message);
          break;
        default:
          yield* this.handleChatStream(message);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[stream] Pipeline failed at intent=${intent}: ${msg}`);
      yield this.errorEvent('PIPELINE_FAILED', msg);
    }
  }

  /**
   * Handle plain chat. Now goes through LLM with a short system prompt
   * so greetings/help questions get a real answer; falls back to a
   * canned string when Ollama is unavailable.
   */
  private async handleChat(message: string): Promise<AiProcessResult> {
    try {
      const reply = await this.llm.invoke({
        system: CHAT_SYSTEM_PROMPT,
        human: message,
        timeoutMs: 20_000,
        temperature: 0.3,
      });
      return {
        intent: 'chat',
        message: reply || this.fallbackChatMessage(message),
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Chat LLM failed (${msg}); using fallback`);
      return {
        intent: 'chat',
        message: this.fallbackChatMessage(message),
      };
    }
  }

  /**
   * Canned reply used when LLM is down. Preserves the old behavior for
   * the existing chat test in ai.service.spec.ts (the test asserts
   * the response contains "你好" — see fallbackChatMessage).
   */
  private fallbackChatMessage(message: string): string {
    return `收到您的消息: "${message}"。当前 LLM 暂不可用,您可以尝试数据查询语句,例如: "按类别显示销售额"。`;
  }

  private async handleSql(message: string): Promise<AiProcessResult> {
    const sql = await this.sqlAgent.generate(message);
    const rows = await this.databaseService.executeQuery(sql);
    // Generate natural-language summary via LLM so the user gets real insights
    const summary = await this.sqlAgent.summarize(rows, message);
    return {
      intent: 'sql',
      message: summary,
      sql,
      executed: true,
      rows,
    };
  }

  private async handleChart(message: string): Promise<AiProcessResult> {
    const sql = await this.sqlAgent.generate(message);
    const rows = await this.databaseService.executeQuery(sql);
    const chart = await this.chartAgent.generate(rows, message);
    return {
      intent: 'chart',
      message: `已生成图表,基于 ${rows.length} 条数据。`,
      sql,
      executed: true,
      rows,
      chart,
    };
  }

  private async handleAnalysis(message: string): Promise<AiProcessResult> {
    const sql = await this.sqlAgent.generate(message);
    const rows = await this.databaseService.executeQuery(sql);
    const analysis = await this.analysisAgent.generate(rows, message);
    return {
      intent: 'analysis',
      message: `分析完成,基于 ${rows.length} 条数据。`,
      sql,
      executed: true,
      rows,
      analysis,
    };
  }

  private errorResult(
    code: string,
    message: string,
    intent: IntentType = 'chat',
  ): AiProcessResult {
    return {
      intent,
      message: '抱歉,处理您的请求时出错了。',
      error: { code, message },
    };
  }

  private errorEvent(
    code: string,
    message: string,
  ): AiStreamEvent {
    return {
      type: 'error',
      data: { code, message },
    };
  }

  // ─── Streaming handlers ─────────────────────────────────────────────────────

  private async *handleChatStream(
    message: string,
  ): AsyncGenerator<AiStreamEvent, void, unknown> {
    let accumulated = '';
    try {
      for await (const token of this.llm.invokeStream({
        system: CHAT_SYSTEM_PROMPT,
        human: message,
        timeoutMs: 20_000,
        temperature: 0.3,
      })) {
        accumulated += token;
        yield {
          type: 'token',
          data: { content: token, isFinal: false },
        };
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[stream] Chat LLM failed (${msg}); using fallback`);
      const fallback = this.fallbackChatMessage(message);
      for (const char of fallback) {
        yield { type: 'token', data: { content: char, isFinal: false } };
      }
    }
    // Mark final
    yield { type: 'done', data: {} };
  }

  private async *handleSqlStream(
    message: string,
  ): AsyncGenerator<AiStreamEvent, void, unknown> {
    // 1. Generate SQL (synchronous, fast)
    let sql: string;
    try {
      sql = await this.sqlAgent.generate(message);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      yield this.errorEvent('SQL_GENERATION_FAILED', msg);
      yield { type: 'done', data: {} };
      return;
    }

    // 2. Execute query
    let rows: unknown[];
    try {
      rows = await this.databaseService.executeQuery(sql);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      yield this.errorEvent('QUERY_EXECUTION_FAILED', msg);
      yield { type: 'done', data: {} };
      return;
    }

    // 3. Emit SQL result (non-token events go out first)
    yield {
      type: 'sql',
      data: { sql, executed: true, rows } as SSESQLData,
    };

    // 4. Stream LLM summary tokens
    let accumulated = '';
    try {
      for await (const token of this.llm.invokeStream({
        system:
          '你是数据分析助手。基于以下 SQL 查询结果，用中文简洁地总结数据要点。',
        human: `查询结果:\n${JSON.stringify(rows, null, 2)}\n\n用户问题: ${message}`,
        timeoutMs: 30_000,
      })) {
        accumulated += token;
        yield {
          type: 'token',
          data: { content: token, isFinal: false },
        };
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[stream] SQL summary LLM failed: ${msg}`);
      // Emit a brief summary instead of letting it fail silently
      const summary = `查询完成,共 ${rows.length} 条记录。`;
      for (const char of summary) {
        yield { type: 'token', data: { content: char, isFinal: false } };
      }
    }

    yield { type: 'done', data: {} };
  }

  private async *handleChartStream(
    message: string,
  ): AsyncGenerator<AiStreamEvent, void, unknown> {
    let sql: string;
    try {
      sql = await this.sqlAgent.generate(message);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      yield this.errorEvent('SQL_GENERATION_FAILED', msg);
      yield { type: 'done', data: {} };
      return;
    }

    let rows: unknown[];
    try {
      rows = await this.databaseService.executeQuery(sql);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      yield this.errorEvent('QUERY_EXECUTION_FAILED', msg);
      yield { type: 'done', data: {} };
      return;
    }

    yield {
      type: 'sql',
      data: { sql, executed: true, rows } as SSESQLData,
    };

    let chart: EChartsOption;
    try {
      chart = await this.chartAgent.generate(rows, message);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      yield this.errorEvent('CHART_GENERATION_FAILED', msg);
      yield { type: 'done', data: {} };
      return;
    }

    const chartData = this.toChartData(chart, rows);
    yield { type: 'chart', data: chartData };

    // Stream a brief confirmation
    const confirmation = `图表已生成,基于 ${rows.length} 条数据。`;
    for (const char of confirmation) {
      yield { type: 'token', data: { content: char, isFinal: false } };
    }

    yield { type: 'done', data: {} };
  }

  private async *handleAnalysisStream(
    message: string,
  ): AsyncGenerator<AiStreamEvent, void, unknown> {
    let sql: string;
    try {
      sql = await this.sqlAgent.generate(message);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      yield this.errorEvent('SQL_GENERATION_FAILED', msg);
      yield { type: 'done', data: {} };
      return;
    }

    let rows: unknown[];
    try {
      rows = await this.databaseService.executeQuery(sql);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      yield this.errorEvent('QUERY_EXECUTION_FAILED', msg);
      yield { type: 'done', data: {} };
      return;
    }

    yield {
      type: 'sql',
      data: { sql, executed: true, rows } as SSESQLData,
    };

    let analysisText: string;
    try {
      analysisText = await this.analysisAgent.generate(rows, message);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      yield this.errorEvent('ANALYSIS_GENERATION_FAILED', msg);
      yield { type: 'done', data: {} };
      return;
    }

    yield { type: 'analysis', data: { content: analysisText } };
    yield { type: 'done', data: {} };
  }

  private toChartData(
    chart: EChartsOption,
    rows?: unknown[],
  ): SSEChartData {
    const series = (chart.series as Array<{ type?: string }>) ?? [];
    const firstSeries = series[0];
    const chartType = (firstSeries?.type as 'bar' | 'line' | 'pie') ?? 'bar';
    return {
      chartType,
      title: chart.title?.text,
      data: {
        option: chart,
        rows: rows ?? [],
      },
    };
  }
}