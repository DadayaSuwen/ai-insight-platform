import { Injectable, Logger } from '@nestjs/common';
import { RouterAgent, IntentType } from './agents/router.agent';
import { SqlAgent } from './agents/sql.agent';
import { ChartAgent, EChartsOption } from './agents/chart.agent';
import { AnalysisAgent } from './agents/analysis.agent';
import { DatabaseService } from '../database/database.service';
import { LlmService } from './llm/llm.service';

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
    return {
      intent: 'sql',
      message: `查询成功,共返回 ${rows.length} 条结果。`,
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
}