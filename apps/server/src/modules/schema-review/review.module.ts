import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { DatasourceModule } from "../datasource/datasource.module";
import { LlmModule } from "../ai/llm/llm.module";
import { ReviewService } from "./review.service";
import { ReviewController } from "./review.controller";

/**
 * [Sprint 6] SchemaReviewModule — Schema 纠错对话
 */
@Module({
  imports: [DatabaseModule, AuthModule, DatasourceModule, LlmModule],
  controllers: [ReviewController],
  providers: [ReviewService],
})
export class SchemaReviewModule {}
