import { Module } from "@nestjs/common";
import { DatabaseService } from "./database.service";
import { HealthController } from "./health.controller";

@Module({
  controllers: [HealthController],
  providers: [DatabaseService],
  exports: [DatabaseService], // ★ 必须有这行
})
export class DatabaseModule {}
