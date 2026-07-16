import { Injectable, Logger, ForbiddenException, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { ConnectionConfig, MetadataSnapshot } from "@workspace/types";
import { DatabaseService } from "../database/database.service";
import {
  encryptConnectionConfigPassword,
  decryptPassword,
} from "./security/crypto-box";

/**
 * [Sprint 1+4+5 / V3] DataSource CRUD 服务 — 多租户版
 *
 * 关键变更 (Sprint 5):
 *   - 所有 CRUD 操作接受 currentUserId,强制加 WHERE userId = ?
 *   - register 时把 userId 写进行
 *   - listAll → listForUser(currentUserId)
 *   - getById → getByIdForUser(id, currentUserId),越权返回 NotFound(不泄露存在性)
 *   - delete → deleteForUser(id, currentUserId)
 *   - persistSnapshot → 无 user 上下文,只在 registerForUser / refresh 之后调
 *
 * 注意:Sprint 1 阶段,ChatSessionService 不读 dataSourceId。Sprint 2
 * PlannerAgent 通过 sessionId 找 DataSourceId,再读 metadata。
 */
@Injectable()
export class DatasourceService {
  private readonly logger = new Logger(DatasourceService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Idempotent register:同 id 重新 register → 覆盖 connectionConfig + name/desc,
   * status 重置为 active,createdAt 保留首次记录。
   *
   * Sprint 4:register 时自动加密 connectionConfig.password(若存在)。
   * Sprint 5:userId 必填,DataSource 行归属 currentUser。
   */
  async register(record: {
    id: string;
    userId: string; // [Sprint 5] 必填
    name: string;
    description?: string;
    type: "postgres" | "mysql" | "duckdb-csv";
    connectionConfig: Record<string, unknown>;
  }) {
    const storedConfig = encryptConfig(record.type, record.connectionConfig);

    const existing = await this.db.db
      .selectFrom("DataSource")
      .selectAll()
      .where("id", "=", record.id)
      .executeTakeFirst();

    if (existing) {
      // 越权检查:同 id 已存在但归属不同用户 → 403
      if (existing.userId !== record.userId) {
        this.logger.warn(
          `DataSource[${record.id}] ownership mismatch: existing=${existing.userId} request=${record.userId}`,
        );
        throw new ForbiddenException(
          `DataSource ${record.id} belongs to another user`,
        );
      }
      this.logger.log(`DataSource[${record.id}] already exists — upserting`);
      return this.db.db
        .updateTable("DataSource")
        .set({
          name: record.name,
          description: record.description ?? null,
          type: record.type,
          connectionConfig: storedConfig,
          status: "active",
          lastError: null,
          updatedAt: new Date(),
        })
        .where("id", "=", record.id)
        .returningAll()
        .executeTakeFirst();
    }

    this.logger.log(
      `DataSource[${record.id}] creating (user=${record.userId})`,
    );
    return this.db.db
      .insertInto("DataSource")
      .values({
        id: record.id,
        userId: record.userId,
        name: record.name,
        description: record.description ?? null,
        type: record.type,
        connectionConfig: storedConfig,
        status: "active",
        lastError: null,
        exploreStatus: "pending",
        schemaUnderstanding: null,
        updatedAt: new Date(),
      })
      .returningAll()
      .executeTakeFirst();
  }

  /**
   * [Sprint 5] 列出当前用户的所有 DataSource
   */
  async listForUser(userId: string) {
    return this.db.db
      .selectFrom("DataSource")
      .selectAll()
      .where("userId", "=", userId)
      .orderBy("createdAt", "desc")
      .execute();
  }

  /**
   * [Sprint 5] 单行查询 + ownership 校验。越权 → 抛 NotFound(不泄露存在性)
   */
  async getByIdForUser(id: string, userId: string) {
    const row = await this.db.db
      .selectFrom("DataSource")
      .selectAll()
      .where("id", "=", id)
      .where("userId", "=", userId)
      .executeTakeFirst();
    return row ?? null;
  }

  /**
   * [Sprint 1 兼容] 不带 userId 的查询 — 仅用于系统内部路径(如
   * MetadataService 预热 cache,此时 userId 上下文已在外层校验过)。
   * 不推荐新代码调用。
   */
  async getById(id: string) {
    return this.db.db
      .selectFrom("DataSource")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
  }

  /**
   * [Sprint 5] 删除当前用户的数据源(越权删除 → NotFound)
   */
  async deleteForUser(id: string, userId: string): Promise<number> {
    const result = await this.db.db
      .deleteFrom("DataSource")
      .where("id", "=", id)
      .where("userId", "=", userId)
      .execute();
    return Number(result[0]?.numDeletedRows ?? 0);
  }

  /**
   * Sprint 4:从数据库读出的 connectionConfig,password 字段可能是密文
   * (ENC:v1:...)。调用方需要 plaintext 喂给 Kysely / mysql2 时,显式调
   * 本方法解密。listAll / getById 仍返回密文,避免泄密到前端。
   */
  decryptConfigForExecutor<T extends ConnectionConfig>(cfg: T): T {
    if ((cfg as { password?: string }).password) {
      const stored = (cfg as { password: string }).password;
      return { ...cfg, password: decryptPassword(stored) } as T;
    }
    return cfg;
  }

  /**
   * 把最新一份 MetadataSnapshot 写到 DataSourceSnapshot 表。
   * 供审计 / "回看一小时前的 schema"。
   */
  async persistSnapshot(snapshot: MetadataSnapshot) {
    return this.db.db
      .insertInto("DataSourceSnapshot")
      .values({
        id: randomUUID(),
        dataSourceId: snapshot.dataSourceId,
        payload: snapshot as unknown as Record<string, unknown>,
        tokenEstimate: snapshot.tokenEstimate,
        truncated: snapshot.truncated,
      })
      .returningAll()
      .executeTakeFirst();
  }

  /**
   * 编辑数据源连接配置 (名称/描述/连接参数)
   */
  async updateConnection(
    dataSourceId: string,
    userId: string,
    opts: {
      name?: string;
      description?: string;
      connectionConfig?: Record<string, unknown>;
    },
  ) {
    const record = await this.getByIdForUser(dataSourceId, userId);
    if (!record) throw new Error("DataSource not found");

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (opts.name !== undefined) updates.name = opts.name;
    if (opts.description !== undefined) updates.description = opts.description;
    if (opts.connectionConfig) {
      // 重新加密密码
      const encrypted = encryptConfig(
        (record.type as "postgres" | "mysql" | "duckdb-csv") ?? "postgres",
        { ...(record.connectionConfig as Record<string, unknown>), ...opts.connectionConfig },
      );
      updates.connectionConfig = encrypted;
    }

    return this.db.db
      .updateTable("DataSource")
      .set(updates as any)
      .where("id", "=", dataSourceId)
      .returningAll()
      .executeTakeFirst();
  }

  /**
   * 更新数据源的 columnAliases (Schema 修订手动编辑后保存)
   *
   * [Fix] 同时把新别名应用到已确认的 schemaUnderstanding 里,
   * 这样 /api/datasources/:id 返回的 schemaUnderstanding 立即反映修改,
   * 前端页面(包括 Schema 修订页 + ChatWindow 推荐提问 + Dashboard 表卡片)
   * 都能看到最新字段中文名。
   */
  async updateColumnAliases(
    dataSourceId: string,
    userId: string,
    aliases: Record<string, { chineseName: string; role?: string; description?: string }>,
  ): Promise<{ updated: number }> {
    const record = await this.getByIdForUser(dataSourceId, userId);
    if (!record) throw new Error("DataSource not found");
    const config = (record.connectionConfig as Record<string, unknown>) ?? {};
    config.columnAliases = aliases;

    // [Fix] 把别名应用到 schemaUnderstanding.tables.columns
    const understanding = (record.schemaUnderstanding as Record<string, unknown> | null) ?? null;
    if (understanding && Array.isArray((understanding as any).tables)) {
      const tables = (understanding as any).tables as Array<{
        name: string;
        columns: Array<{ name: string; chineseName?: string; semanticRole?: string; description?: string }>;
      }>;
      for (const t of tables) {
        for (const col of t.columns) {
          const alias = aliases[col.name];
          if (!alias) continue;
          if (alias.chineseName) col.chineseName = alias.chineseName;
          if (alias.role === "dimension" ||
              alias.role === "measure" ||
              alias.role === "time" ||
              alias.role === "identifier") {
            col.semanticRole = alias.role as any;
          }
          if (alias.description) col.description = alias.description;
        }
      }
    }

    await this.db.db
      .updateTable("DataSource")
      .set({
        connectionConfig: config,
        schemaUnderstanding: understanding,
        updatedAt: new Date(),
      })
      .where("id", "=", dataSourceId)
      .execute();

    return { updated: Object.keys(aliases).length };
  }
}

/**
 * 按 type 决定如何加密 connectionConfig(目前仅 PG/MySQL 含 password)。
 * CSV type 没有 password,直接返回原值。
 */
function encryptConfig(
  type: "postgres" | "mysql" | "duckdb-csv",
  cfg: Record<string, unknown>,
): Record<string, unknown> {
  if (type === "duckdb-csv") return cfg;
  return encryptConnectionConfigPassword(
    cfg as { password?: string | undefined },
  );
}