import { Module } from "@nestjs/common";
import { AiService } from "./ai.service";
import { ChartHelper } from "./tools/chart.helper";
import { ChartAgent } from "./agents/chart.agent";
import { PlannerAgent } from "./agents/planner.agent";
import { InsightAgent } from "./agents/insight.agent";
import { ToolResultContext } from "./tools/tool-result.context";
import { DatabaseModule } from "../database/database.module";
import { LlmModule } from "./llm/llm.module";
import { LlmController } from "./llm/llm.controller";

@Module({
  imports: [DatabaseModule, LlmModule],
  controllers: [LlmController],
  providers: [
    AiService,
    ChartHelper,
    ChartAgent,
    // [M13-V2] ChartValidator 删除 — V2 不再让 LLM 输出 EChartsOption,
    //          装配由 ChartHelper.assemble() 100% 确定,无需校验器
    PlannerAgent,
    InsightAgent,
    ToolResultContext,
  ],
  exports: [AiService],
})
export class AiModule {}
