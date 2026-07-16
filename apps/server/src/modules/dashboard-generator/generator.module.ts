import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { DatasourceModule } from "../datasource/datasource.module";
import { LlmModule } from "../ai/llm/llm.module";
import { DashboardGeneratorService } from "./generator.service";
import { DashboardGeneratorController } from "./generator.controller";

@Module({
  imports: [DatabaseModule, AuthModule, DatasourceModule, LlmModule],
  controllers: [DashboardGeneratorController],
  providers: [DashboardGeneratorService],
})
export class DashboardGeneratorModule {}
