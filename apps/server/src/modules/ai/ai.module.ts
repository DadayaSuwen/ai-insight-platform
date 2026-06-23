import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { SqlAgent } from './agents/sql.agent';
import { ChartAgent } from './agents/chart.agent';
import { AnalysisAgent } from './agents/analysis.agent';
import { PlannerAgent } from './agents/planner.agent';
import { DatabaseModule } from '../database/database.module';
import { LlmModule } from './llm/llm.module';
import { LlmController } from './llm/llm.controller';

@Module({
  imports: [DatabaseModule, LlmModule],
  controllers: [AiController, LlmController],
  providers: [
    AiService,
    SqlAgent,
    ChartAgent,
    AnalysisAgent,
    PlannerAgent,
  ],
  exports: [AiService],
})
export class AiModule {}
