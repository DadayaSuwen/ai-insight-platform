import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { DatasourceModule } from "../datasource/datasource.module";
import { ExploreService } from "./explore.service";
import { ExploreController } from "./explore.controller";

/**
 * [Sprint 6] SchemaExplorerModule — 自主 Schema 探索
 */
@Module({
  imports: [DatabaseModule, AuthModule, DatasourceModule],
  controllers: [ExploreController],
  providers: [ExploreService],
})
export class SchemaExplorerModule {}
