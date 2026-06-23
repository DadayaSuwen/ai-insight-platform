import { Module } from "@nestjs/common";
import { AiService } from "./ai.service";
import { ChartHelper } from "./tools/chart.helper";
import { PlannerAgent } from "./agents/planner.agent";
import { DatabaseModule } from "../database/database.module";
import { LlmModule } from "./llm/llm.module";
import { LlmController } from "./llm/llm.controller";

@Module({
  imports: [DatabaseModule, LlmModule],
  controllers: [LlmController],
  providers: [AiService, ChartHelper, PlannerAgent],
  exports: [AiService],
})
export class AiModule {}
