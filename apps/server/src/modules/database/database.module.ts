import { Module } from "@nestjs/common";
import { DatabaseService } from "./database.service";

@Module({
  providers: [DatabaseService],
  exports: [DatabaseService], // ★ 必须有这行
})
export class DatabaseModule {}
