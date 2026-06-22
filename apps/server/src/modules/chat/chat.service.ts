import { Injectable, Logger } from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { catchError, mergeMap } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import {
  SSEEventType,
  SSETokenData,
  SSESQLData,
  SSEChartData,
  SSEAnalysisData,
  SSEErrorData,
} from '@workspace/types';
import { AiService, AiProcessResult } from '../ai/ai.service';
import { EChartsOption, ChartType } from '../ai/agents/chart.agent';

/**
 * ChatService - Chat streaming and orchestration
 *
 * Wraps AiService and exposes a non-streaming sync call plus an SSE stream.
 * The stream emits events in the contract order:
 *   token → (error) → (sql) → (chart) → (analysis) → done
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private readonly aiService: AiService) {}

  /**
   * Synchronous call - returns the full AiProcessResult.
   * Useful for callers that don't need streaming.
   */
  async processMessage(message: string): Promise<AiProcessResult> {
    return this.aiService.process(message);
  }

  /**
   * SSE stream - converts AiProcessResult into a sequence of MessageEvent
   * matching the SSE contract defined in packages/types.
   */
  processMessageStream(message: string): Observable<MessageEvent> {
    this.logger.log(`SSE stream start: ${message}`);
    return from(this.aiService.process(message)).pipe(
      mergeMap((result: AiProcessResult) => from(this.resultToEvents(result))),
      catchError((err: unknown) => {
        this.logger.error(`SSE pipeline error: ${err}`);
        const errorData: SSEErrorData = {
          code: 'STREAM_FAILED',
          message: err instanceof Error ? err.message : String(err),
        };
        return from<MessageEvent[]>([
          { type: SSEEventType.ERROR, data: errorData },
          { type: SSEEventType.DONE, data: {} },
        ]);
      }),
    );
  }

  /**
   * Map AiProcessResult to an ordered list of MessageEvent.
   */
  private resultToEvents(result: AiProcessResult): MessageEvent[] {
    const events: MessageEvent[] = [];

    // 1. Token - always first, carries the user-facing summary text
    const tokenData: SSETokenData = {
      content: result.message,
      isFinal: false,
    };
    events.push({ type: SSEEventType.TOKEN, data: tokenData });

    // 2. Error - emit before data events so the UI can stop rendering
    if (result.error) {
      const errorData: SSEErrorData = {
        code: result.error.code,
        message: result.error.message,
      };
      events.push({ type: SSEEventType.ERROR, data: errorData });
    }

    // 3. SQL - emitted when a query was generated
    if (result.sql !== undefined) {
      const sqlData: SSESQLData = {
        sql: result.sql,
        executed: result.executed ?? false,
      };
      events.push({ type: SSEEventType.SQL, data: sqlData });
    }

    // 4. Chart - emitted when a chart was generated
    if (result.chart) {
      const chartData = this.toChartData(result.chart, result.rows);
      events.push({ type: SSEEventType.CHART, data: chartData });
    }

    // 5. Analysis - emitted when an analysis report was generated
    if (result.analysis) {
      const analysisData: SSEAnalysisData = {
        content: result.analysis,
      };
      events.push({ type: SSEEventType.ANALYSIS, data: analysisData });
    }

    // 6. Done - always last
    events.push({ type: SSEEventType.DONE, data: {} });

    return events;
  }

  /**
   * Convert internal EChartsOption to the SSE contract shape.
   * The full ECharts config travels in `data` for the frontend to render.
   */
  private toChartData(
    chart: EChartsOption,
    rows?: unknown[],
  ): SSEChartData {
    const series = (chart.series as Array<{ type?: string }>) ?? [];
    const firstSeries = series[0];
    const chartType: ChartType = (firstSeries?.type as ChartType) ?? 'bar';

    // The contract wants a `data` map; we pack the full chart + rows
    // so the frontend can render either via the option or via the data.
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
