import {
  Controller,
  Post,
  Body,
  Sse,
  Query,
  MessageEvent,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import {
  ChatMessageRequestSchema,
  SSEEventType,
  SSEErrorData,
} from '@workspace/types';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * Sync (non-streaming) endpoint.
   * Returns the full AiProcessResult.
   */
  @Post('message')
  async sendMessage(@Body() body: unknown) {
    const request = ChatMessageRequestSchema.parse(body);
    return this.chatService.processMessage(request.message);
  }

  /**
   * SSE stream endpoint.
   * GET /chat/stream?message=...
   * Emits events per the SSE contract (token/sql/chart/analysis/error/done).
   */
  @Sse('stream')
  stream(@Query('message') message: string): Observable<MessageEvent> {
    if (!message || typeof message !== 'string') {
      return new Observable<MessageEvent>((subscriber) => {
        const errorData: SSEErrorData = {
          code: 'INVALID_MESSAGE',
          message: 'message query param is required',
        };
        subscriber.next({ type: SSEEventType.ERROR, data: errorData });
        subscriber.next({ type: SSEEventType.DONE, data: {} });
        subscriber.complete();
      });
    }
    return this.chatService.processMessageStream(message);
  }
}
