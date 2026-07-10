import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { LlmModule } from "../ai/llm/llm.module";
import { DatasourceService } from "./datasource.service";
import { DatasourceController } from "./datasource.controller";
import { ExecutorFactory } from "./executors/executor.factory";
import { MetadataService } from "./metadata/metadata.service";
import { MetadataCacheService } from "./metadata/metadata-cache.service";
import { SemanticInferenceService } from "./metadata/semantic-inference.service";
import { QueryGatewayService } from "./query-gateway/query-gateway.service";
import { QueryCacheService } from "./query-gateway/cache.service";
import { UploadController } from "./upload/upload.controller";
import { UploadService } from "./upload/upload.service";
import { CsvImportService } from "./upload/csv-import.service";

/**
 * [Sprint 1+3+4+5 / V3] DatasourceModule
 *
 * 装配:
 *   - CRUD + Controller (含 /api/datasources/test)
 *   - Upload Controller (CSV preview + register)
 *   - 元数据服务 + cache
 *   - 执行器工厂 (3 种执行器实现由 factory `new`,不走 DI)
 *   - 查询网关 + 查询缓存
 *   - [Sprint 5.5] DatasourceSeed 已删除,用户自行通过 UI 接入数据源
 *   - [Sprint 5] 多租户:import AuthModule 拿 JwtAuthGuard
 */
@Module({
  imports: [DatabaseModule, AuthModule, LlmModule],
  controllers: [DatasourceController, UploadController],
  providers: [
    DatasourceService,
    ExecutorFactory,
    MetadataService,
    MetadataCacheService,
    QueryGatewayService,
    QueryCacheService,
    SemanticInferenceService,
    UploadService,
    CsvImportService,
  ],
  exports: [
    DatasourceService,
    MetadataService,
    MetadataCacheService,
    QueryGatewayService,
    QueryCacheService,
    ExecutorFactory,
  ],
})
export class DatasourceModule {}