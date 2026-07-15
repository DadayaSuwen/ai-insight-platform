import { DatabaseService } from "../database/database.service";
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Put,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import type { ConnectionConfig } from "@workspace/types";
import { ConnectionConfigSchema, DataSourceTypeSchema } from "@workspace/types";
import { z } from "zod";
import { DatasourceService } from "./datasource.service";
import { MetadataService } from "./metadata/metadata.service";
import { MetadataCacheService } from "./metadata/metadata-cache.service";
import { ExecutorFactory } from "./executors/executor.factory";
import { QueryCacheService } from "./query-gateway/cache.service";
import { CsvImportService } from "./upload/csv-import.service";
import { JwtAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/auth.decorators";
import { PermissionsGuard } from "../rbac/permissions.guard";
import { Permissions } from "../rbac/permissions.decorator";
import { PERMISSIONS } from "../rbac/permissions";
import { Throttle } from "@nestjs/throttler";

/**
 * [Sprint 1+4+5 / V3] DataSource REST 端点 — 多租户
 *
 *   GET    /api/datasources                       → 列表(当前 user)
 *   GET    /api/datasources/:id                   → 详情(当前 user)
 *   POST   /api/datasources                       → register(当前 user)
 *   POST   /api/datasources/test                  → 测试连接(无需 user,任意调用)
 *   DELETE /api/datasources/:id                   → delete(当前 user)
 *   POST   /api/datasources/:id/refresh           → re-introspect + 清缓存
 *
 * Sprint 3:upload/preview + upload/register 端点在 UploadController
 * Sprint 5:所有 user-scoped 端点 @UseGuards(JwtAuthGuard);test 端点保持公开
 */
const RegisterBodySchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  type: DataSourceTypeSchema,
  connectionConfig: ConnectionConfigSchema,
});

const TestConnectionSchema = z.object({
  type: z.enum(["postgres", "mysql"]),
  host: z.string().min(1),
  port: z.number().int().positive(),
  database: z.string().min(1),
  user: z.string().min(1),
  password: z.string().optional(),
  ssl: z.boolean().optional(),
  schema: z.string().optional(),
});

@Controller("api/datasources")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DatasourceController {
  constructor(
    private readonly ds: DatasourceService,
    private readonly meta: MetadataService,
    private readonly cache: MetadataCacheService,
    private readonly db: DatabaseService,
    private readonly queryCache: QueryCacheService,
    private readonly factory: ExecutorFactory,
    private readonly csvImport: CsvImportService,
  ) {}

  @Get()
  async list(@CurrentUser() user: { sub: string }) {
    const items = await this.ds.listForUser(user.sub);
    return { success: true, data: items };
  }

  @Get(":id")
  async get(@Param("id") id: string, @CurrentUser() user: { sub: string }) {
    const item = await this.ds.getByIdForUser(id, user.sub);
    if (!item) {
      throw new NotFoundException(`DataSource ${id} not found`);
    }
    return { success: true, data: item };
  }

  /** Schema 修订 — 手动保存列别名/角色/描述 */
  @Post(":id/columns")
  @Permissions(PERMISSIONS.CONNECT_DATASOURCE)
  async saveColumns(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentUser() user: { sub: string },
  ) {
    const parsed = z
      .object({ columns: z.record(z.object({ chineseName: z.string(), role: z.string().optional(), description: z.string().optional() })) })
      .parse(body);
    const result = await this.ds.updateColumnAliases(id, user.sub, parsed.columns);
    // 刷新元数据缓存
    this.cache.invalidate(id);
    return { success: true, data: result };
  }

  /** 编辑数据源连接配置 */
  @Put(":id")
  @Permissions(PERMISSIONS.CONNECT_DATASOURCE)
  async update(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentUser() user: { sub: string },
  ) {
    const parsed = z.object({
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(1000).optional(),
      host: z.string().min(1).optional(),
      port: z.number().int().positive().optional(),
      database: z.string().min(1).optional(),
      user: z.string().min(1).optional(),
      password: z.string().optional(),
      ssl: z.boolean().optional(),
      schema: z.string().optional(),
    }).parse(body);

    // 校验所有权
    const record = await this.ds.getByIdForUser(id, user.sub);
    if (!record) throw new NotFoundException(`DataSource ${id} not found`);

    // 合并 connectionConfig
    const config = (record.connectionConfig as Record<string, unknown>) ?? {};
    if (parsed.host !== undefined) config.host = parsed.host;
    if (parsed.port !== undefined) config.port = parsed.port;
    if (parsed.database !== undefined) config.database = parsed.database;
    if (parsed.user !== undefined) config.user = parsed.user;
    if (parsed.password !== undefined) config.password = parsed.password;
    if (parsed.ssl !== undefined) config.ssl = parsed.ssl;
    if (parsed.schema !== undefined) config.schema = parsed.schema;

    const updated = await this.ds.updateConnection(id, user.sub, {
      name: parsed.name,
      description: parsed.description,
      connectionConfig: config,
    });

    this.cache.invalidate(id);
    await this.factory.evict(id);
    return { success: true, data: updated };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions(PERMISSIONS.CONNECT_DATASOURCE)
  async register(
    @Body() body: unknown,
    @CurrentUser() user: { sub: string },
  ) {
    const parsed = RegisterBodySchema.parse(body);
    const created = await this.ds.register({
      id: parsed.id,
      userId: user.sub,
      name: parsed.name,
      description: parsed.description,
      type: parsed.type,
      connectionConfig: parsed.connectionConfig as unknown as Record<
        string,
        unknown
      >,
    });
    return { success: true, data: created };
  }

  /**
   * 测试连接 — 公开端点(用户未登录也想确认 DB 是否可达),不走 JwtAuthGuard
   */
  @Post("test")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async testConnection(@Body() body: unknown) {
    const parsed = TestConnectionSchema.parse(body);
    const cfg: ConnectionConfig =
      parsed.type === "postgres"
        ? {
            type: "postgres",
            host: parsed.host,
            port: parsed.port,
            database: parsed.database,
            user: parsed.user,
            password: parsed.password,
            ssl: parsed.ssl ?? false,
            schema: parsed.schema ?? "public",
          }
        : {
            type: "mysql",
            host: parsed.host,
            port: parsed.port,
            database: parsed.database,
            user: parsed.user,
            password: parsed.password,
          };

    const exec = this.factory.create("test-only", cfg);
    try {
      const health = await exec.healthCheck();
      if (!health.ok) {
        throw new HttpException(
          {
            success: false,
            error: {
              code: "CONNECTION_FAILED",
              message: health.error ?? "unknown error",
              latencyMs: health.latencyMs,
            },
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      return {
        success: true,
        data: { ok: true, latencyMs: health.latencyMs },
      };
    } finally {
      await exec.dispose();
    }
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions(PERMISSIONS.CONNECT_DATASOURCE)
  async remove(
    @Param("id") id: string,
    @CurrentUser() user: { sub: string },
  ) {
    // 先查出记录以便获取 tableName (del 后记录消失)
    const item = await this.ds.getByIdForUser(id, user.sub);
    if (!item) {
      throw new NotFoundException(`DataSource ${id} not found`);
    }

    // 清空引用该数据源的 ChatSession（无 FK 约束，手动清理）
    try {
      await this.db.db
        .updateTable("ChatSession")
        .set({ dataSourceId: null as unknown as string })
        .where("dataSourceId", "=", id)
        .execute();
    } catch { /* best-effort */ }

    const deleted = await this.ds.deleteForUser(id, user.sub);
    if (deleted === 0) {
      throw new NotFoundException(`DataSource ${id} not found`);
    }
    this.cache.invalidate(id);
    this.queryCache.invalidate(id);
    await this.factory.evict(id);

    // [Sprint 5.6] CSV 导入表联动 DROP
    const cfg = item.connectionConfig as Record<string, unknown>;
    if (
      item.type === "postgres" &&
      typeof cfg.tableName === "string" &&
      cfg.tableName.startsWith("csv_dataset_")
    ) {
      await this.csvImport.dropTable(cfg.tableName);
    }
  }

  /** Re-introspect:clear cache + restart executor (仅 PG/MySQL, CSV 跳过) */
  @Post(":id/refresh")
  @Permissions(PERMISSIONS.CONNECT_DATASOURCE)
  async refresh(@Param("id") id: string, @CurrentUser() user: { sub: string }) {
    const item = await this.ds.getByIdForUser(id, user.sub);
    if (!item) {
      throw new NotFoundException(`DataSource ${id} not found`);
    }

    this.cache.invalidate(id);
    this.queryCache.invalidate(id);

    // [Sprint 5.5] DuckDB-CSV 是静态文件, evict 旧 executor 后不重建
    // (下次查询时 factory.create() 会 lazy 初始化新的, 用最新代码)
    if (item.type === "duckdb-csv") {
      await this.factory.evict(id);
      const snapshot = await this.meta.get(id, { refresh: true });
      return {
        success: true,
        data: { dataSourceId: id, snapshot, health: { ok: true, latencyMs: 0 } },
      };
    }

    // PG / MySQL: evict old + create new executor + healthCheck
    await this.factory.evict(id);

    const executor = this.factory.create(
      id,
      this.ds.decryptConfigForExecutor(
        item.connectionConfig as unknown as ConnectionConfig,
      ),
    );
    try {
      const health = await executor.healthCheck();
      if (!health.ok) {
        throw new HttpException(
          {
            success: false,
            error: {
              code: "DATASOURCE_HEALTHCHECK_FAILED",
              message: health.error ?? "unknown error",
            },
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      const snapshot = await this.meta.get(id, { refresh: true });
      return {
        success: true,
        data: {
          dataSourceId: id,
          snapshot,
          health,
        },
      };
    } catch (err) {
      // 失败时 evict(executor 可能处于 broken state)
      await this.factory.evict(id);
      throw err;
    }
  }
}