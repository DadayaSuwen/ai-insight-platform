import { Injectable } from '@nestjs/common';

@Injectable()
export class ChatService {
  async processMessage(message: string): Promise<void> {
    // TODO: Implement chat processing logic
  }
}