import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../database/database.module';
import { LlmService } from './llm.service';
import { LlmStatsCollector } from './llm-stats.collector';

@Module({
  imports: [ConfigModule, DatabaseModule],
  providers: [LlmService, LlmStatsCollector],
  exports: [LlmService, LlmStatsCollector],
})
export class LlmModule {}