import { Injectable, Logger } from '@nestjs/common';
import { SqlAgent } from './agents/sql.agent';
import { ChartAgent, EChartsOption } from './agents/chart.agent';
import { AnalysisAgent } from './agents/analysis.agent';
import { DatabaseService } from '../database/database.service';
import { LlmService } from './llm/llm.service';
import {
  PlannerAgent,
  type PlannerStreamEvent,
} from './agents/planner.agent';
import type {
  SSETokenData,
  SSESQLData,
  SSEChartData,
  SSEAnalysisData,
  SSEErrorData,
} from '@workspace/types';

/** Legacy intent type — kept for AiProcessResult compatibility */
type IntentType = 'sql' | 'chart' | 'analysis' | 'chat';

/**
 * Structured result returned by AiService.process().
 */
export interface AiProcessResult {
  intent: IntentType;
  message: string;
  sql?: string;
  executed?: boolean;
  rows?: unknown[];
  chart?: EChartsOption;
  analysis?: string;
  error?: { code: string; message: string };
}

/**
 * AiService — Pipeline Orchestrator (delegates to PlannerAgent)
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly plannerAgent: PlannerAgent,
    private readonly sqlAgent: SqlAgent,
    private readonly chartAgent: ChartAgent,
    private readonly analysisAgent: AnalysisAgent,
    private readonly databaseService: DatabaseService,
    private readonly llm: LlmService,
  ) {}

  async process(message: string): Promise<AiProcessResult> {
    this.logger.log(`Processing message: ${message}`);

    try {
      await this.plannerAgent.refreshSchema();

      const events: PlannerStreamEvent[] = [];
      for await (const event of this.plannerAgent.invokeStream(message)) {
        events.push(event);
      }

      return this.synthesizeResult(events);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`PlannerAgent failed: ${msg}`);
      return this.errorResult('PLANNER_FAILED', msg);
    }
  }

  async *processStream(
    message: string,
  ): AsyncGenerator<PlannerStreamEvent, void, unknown> {
    this.logger.log(`[stream] Processing message: ${message}`);

    try {
      await this.plannerAgent.refreshSchema();
      yield* this.plannerAgent.invokeStream(message);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[stream] PlannerAgent failed: ${msg}`);
      yield {
        type: 'error',
        data: { code: 'PLANNER_FAILED', message: msg },
      };
      yield { type: 'done', data: {} };
    }
  }

  private synthesizeResult(events: PlannerStreamEvent[]): AiProcessResult {
    let message = '';
    let sql: string | undefined;
    let executed = false;
    let rows: unknown[] | undefined;
    let chart: EChartsOption | undefined;
    let analysis: string | undefined;
    let intent: IntentType = 'chat';

    for (const event of events) {
      if (event.type === 'token') {
        message += (event.data as { content: string }).content;
      } else if (event.type === 'sql') {
        const d = event.data as unknown as SSESQLData;
        sql = d.sql;
        executed = d.executed;
        rows = d.rows;
        intent = 'sql';
      } else if (event.type === 'chart') {
        const d = event.data as unknown as SSEChartData;
        chart = d.data?.option as EChartsOption;
        intent = 'chart';
      } else if (event.type === 'analysis') {
        analysis = (event.data as { content: string }).content;
        intent = 'analysis';
      } else if (event.type === 'error') {
        const d = event.data as { code?: string; message: string };
        return this.errorResult(d.code ?? 'UNKNOWN', d.message);
      }
    }

    return {
      intent,
      message: message || '处理完成。',
      sql,
      executed,
      rows,
      chart,
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
      message: '抱歉，处理您的请求时出错了。',
      error: { code, message },
    };
  }
}
