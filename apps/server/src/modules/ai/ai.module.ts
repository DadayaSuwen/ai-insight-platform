import { Module } from "@nestjs/common";
import { AiService } from "./ai.service";
import { ChartHelper } from "./tools/chart.helper";
import { ChartAgent } from "./agents/chart.agent";
import { PlannerAgent } from "./agents/planner.agent";
import { InsightAgent } from "./agents/insight.agent";
import { ToolResultContext } from "./tools/tool-result.context";
import { LlmStatsCollector } from "./llm/llm-stats.collector";
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
 *
 * [chat-system-architecture.md §六原则 4] LlmStatsCollector 由 LlmModule 提供,
 * 在此再次声明为 provider 并 re-export,让 ChatService(通过 AiModule 间接)能注入。
 * (Nest 规则:re-export 的 provider 必须在本 module 的 providers 数组里也声明一遍。)
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
    LlmStatsCollector,
  ],
  exports: [AiService, InsightAgent, LlmStatsCollector],
})
export class AiModule {}