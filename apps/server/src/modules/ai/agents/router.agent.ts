import { Injectable } from '@nestjs/common';

export type IntentType = 'sql' | 'chart' | 'analysis' | 'chat';

@Injectable()
export class RouterAgent {
  async recognize(message: string): Promise<IntentType> {
    // TODO: Implement intent recognition using LLM
    return 'sql';
  }
}