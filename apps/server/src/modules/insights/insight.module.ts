import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { AiModule } from "../ai/ai.module";
import { RbacModule } from "../rbac/rbac.module";
import { InsightController } from "./insight.controller";
import { InsightSchedulerService } from "./insight-scheduler.service";

@Module({
  imports: [DatabaseModule, AuthModule, AiModule, RbacModule],
  controllers: [InsightController],
  providers: [InsightSchedulerService],
  exports: [InsightSchedulerService],
})
export class InsightModule {}
