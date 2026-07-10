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
import { DatasourceModule } from "../datasource/datasource.module";

/**
 * [Sprint 2] V3 — AiModule 装配
 *
 * PlannerAgent 现在依赖 datasource 模块的多个服务:
 *   - MetadataCacheService
 *   - DatasourceService
 *   - MetadataService
 *   - QueryGatewayService
 * 这些都从 DatasourceModule.exports 注入。
 */
@Module({
  imports: [DatabaseModule, LlmModule, DatasourceModule],
  controllers: [LlmController],
  providers: [
    AiService,
    ChartHelper,
    ChartAgent,
    PlannerAgent,
    InsightAgent,
    ToolResultContext,
  ],
  exports: [AiService],
})
export class AiModule {}