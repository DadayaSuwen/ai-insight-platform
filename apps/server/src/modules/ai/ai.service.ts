import { Injectable, Logger } from '@nestjs/common';
import { RouterAgent, IntentType } from './agents/router.agent';
import { SqlAgent } from './agents/sql.agent';
import { ChartAgent, EChartsOption } from './agents/chart.agent';
import { AnalysisAgent } from './agents/analysis.agent';
import { DatabaseService } from '../database/database.service';

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
          return this.handleChat(message);
        case 'sql':
          return await this.handleSql(message);
        case 'chart':
          return await this.handleChart(message);
        case 'analysis':
          return await this.handleAnalysis(message);
        default:
          return this.handleChat(message);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Pipeline failed at intent=${intent}: ${msg}`);
      return this.errorResult('PIPELINE_FAILED', msg, intent);
    }
  }

  private handleChat(message: string): AiProcessResult {
    return {
      intent: 'chat',
      message: `收到您的消息: "${message}"。当前还在接入 LLM,您可以尝试查询语句,例如: "按类别显示销售额"。`,
    };
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
