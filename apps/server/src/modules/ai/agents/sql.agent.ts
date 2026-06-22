import { Injectable } from '@nestjs/common';

@Injectable()
export class SqlAgent {
  async generate(message: string, schema: unknown): Promise<string> {
    // TODO: Implement SQL generation using LLM
    return 'SELECT * FROM sales LIMIT 10';
  }
}