import { Injectable, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import {
  SSEEventType,
  SSEErrorData,
} from '@workspace/types';
import { AiService, type AiProcessResult } from '../ai/ai.service';
import type { PlannerStreamEvent } from '../ai/agents/planner.agent';

/**
 * ChatService - Chat streaming and orchestration
 *
 * Wraps AiService and exposes a non-streaming sync call plus a true
 * streaming SSE stream powered by the LLM's token-by-token output.
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
   * True SSE stream — each yield from aiService.processStream() maps to
   * an immediate SSE emission, giving token-by-token output for chat intents.
   */
  processMessageStream(message: string): Observable<MessageEvent> {
    this.logger.log(`SSE stream start: ${message}`);
    return new Observable<MessageEvent>((subscriber) => {
      const abortController = new AbortController();

      (async () => {
        try {
          for await (const event of this.aiService.processStream(message)) {
            if (abortController.signal.aborted) break;
            const msgEvent = this.mapEvent(event);
            if (msgEvent) {
              subscriber.next(msgEvent);
            }
          }
          subscriber.next({ type: SSEEventType.DONE, data: {} });
          subscriber.complete();
        } catch (err: unknown) {
          this.logger.error(`SSE stream error: ${err}`);
          const errorData: SSEErrorData = {
            code: 'STREAM_FAILED',
            message: err instanceof Error ? err.message : String(err),
          };
          subscriber.next({ type: SSEEventType.ERROR, data: errorData });
          subscriber.next({ type: SSEEventType.DONE, data: {} });
          subscriber.complete();
        }
      })();

      return () => {
        abortController.abort();
      };
    });
  }

  /**
   * Map an AiStreamEvent to an SSE MessageEvent.
   * Returns null for 'done' (caller sends it) or unknown types.
   */
  private mapEvent(event: PlannerStreamEvent): MessageEvent | null {
    switch (event.type) {
      case 'token':
        return {
          type: SSEEventType.TOKEN,
          data: event.data as { content: string; isFinal: boolean },
        };
      case 'sql':
        return { type: SSEEventType.SQL, data: event.data };
      case 'chart':
        return { type: SSEEventType.CHART, data: event.data };
      case 'analysis':
        return { type: SSEEventType.ANALYSIS, data: event.data };
      case 'error':
        return {
          type: SSEEventType.ERROR,
          data: event.data as SSEErrorData,
        };
      case 'tool_call':
        return {
          type: SSEEventType.TOOL_CALL,
          data: event.data as unknown as Record<string, unknown>,
        };
      case 'tool_result':
        return {
          type: SSEEventType.TOOL_RESULT,
          data: event.data as unknown as Record<string, unknown>,
        };
      case 'done':
        return null;
      default:
        return null;
    }
  }
}
