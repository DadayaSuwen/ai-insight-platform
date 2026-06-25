import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../database/database.module';
import { LlmService } from './llm.service';

@Module({
  imports: [ConfigModule, DatabaseModule],
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {}