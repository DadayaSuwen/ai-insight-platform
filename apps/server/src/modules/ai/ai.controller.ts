import { Controller, Post, Body } from '@nestjs/common';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('process')
  async process(@Body('message') message: string) {
    await this.aiService.process(message);
    return { status: 'ok' };
  }
}