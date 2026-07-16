import { Module } from "@nestjs/common";
import { RolesController } from "./roles.controller";
import { DatabaseModule } from "../database/database.module";

@Module({
  imports: [DatabaseModule],
  controllers: [RolesController],
})
export class RolesModule {}