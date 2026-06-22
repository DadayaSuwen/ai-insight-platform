import { Injectable } from '@nestjs/common';

@Injectable()
export class ChartAgent {
  async generate(data: unknown[], message: string): Promise<object> {
    // TODO: Implement chart config generation using LLM
    return {
      type: 'bar',
      data: [],
    };
  }
}