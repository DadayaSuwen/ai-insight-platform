import { Injectable, ForbiddenException, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { DatasourceService } from "../datasource/datasource.service";
import { randomUUID } from "crypto";

/**
 * [Sprint 2+5] V3 多数据源绑定 + 多租户
 *
 * Sprint 2: ChatSession.dataSourceId nullable
 *
 * Sprint 5 行为:
 *   - createSession({title?, dataSourceId?, userId}) — userId 必填
 *   - getByIdForUser / getSessionsForUser / deleteForUser — 强制加 WHERE userId
 *   - 跨用户访问 → NotFoundException(不泄露存在性)
 */
@Injectable()
export class ChatSessionService {
  constructor(
    private readonly db: DatabaseService,
    private readonly ds: DatasourceService,
  ) {}

  async createSession(opts: {
    title?: string;
    dataSourceId?: string | null;
    userId: string; // [Sprint 5] 必填
  }) {
    // [BUG-002] 校验 dataSourceId 归属，防止用户 A 绑定用户 B 的数据源
    if (opts.dataSourceId) {
      const ds = await this.ds.getByIdForUser(opts.dataSourceId, opts.userId);
      if (!ds) throw new NotFoundException("DataSource not found or access denied");
    }
    return this.db.db
      .insertInto("ChatSession")
      .values({
        title: opts.title ?? "新对话",
        id: randomUUID(),
        userId: opts.userId, // [Sprint 5]
        dataSourceId: opts.dataSourceId ?? null,
        updatedAt: new Date(),
      })
      .returningAll()
      .executeTakeFirst();
  }

  /**
   * [Sprint 5] 单 session 查询 + ownership 校验。越权 → NotFound(不泄露存在性)
   */
  async getByIdForUser(sessionId: string, userId: string) {
    return this.db.db
      .selectFrom("ChatSession")
      .selectAll()
      .where("id", "=", sessionId)
      .where("userId", "=", userId)
      .executeTakeFirst();
  }

  /**
   * [Sprint 2] SSE 链路入口前调用:拿 session 时连带 dataSourceId。
   *
   * [Sprint 5] 加 userId 校验
   */
  async getSessionById(sessionId: string, userId: string) {
    return this.getByIdForUser(sessionId, userId);
  }

  /**
   * 决定实际数据源:
   *   - session.dataSourceId 显式设置 → 用它
   *   - NULL → 空字符串 (前端应提示用户先选择数据源)
   */
  static resolveDataSourceId(
    session: { dataSourceId: string | null } | undefined | null,
  ): string {
    return session?.dataSourceId ?? "";
  }

  async getSessionsForUser(userId: string) {
    return this.db.db
      .selectFrom("ChatSession")
      .selectAll()
      .where("userId", "=", userId)
      .orderBy("updatedAt", "desc")
      .execute();
  }

  async getMessagesBySessionId(sessionId: string, userId: string) {
    // 隐式 ownership 校验:getSessionById 已做 userId 过滤
    const session = await this.getByIdForUser(sessionId, userId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }
    return this.db.db
      .selectFrom("ChatMessage")
      .selectAll()
      .where("sessionId", "=", sessionId)
      .orderBy("createdAt", "asc")
      .execute();
  }

  async saveMessage(
    sessionId: string,
    userId: string,
    role: string,
    content: string,
    metadata?: Record<string, unknown>,
  ) {
    // 隐式 ownership 校验
    const session = await this.getByIdForUser(sessionId, userId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }
    return this.db.db
      .insertInto("ChatMessage")
      .values({
        id: randomUUID(),
        sessionId,
        role,
        content,
        metadata: metadata ?? null,
      })
      .returningAll()
      .executeTakeFirst();
  }

  async updateSessionTitle(
    sessionId: string,
    userId: string,
    title: string,
  ) {
    const result = await this.db.db
      .updateTable("ChatSession")
      .set({ title, updatedAt: new Date() })
      .where("id", "=", sessionId)
      .where("userId", "=", userId)
      .returningAll()
      .executeTakeFirst();
    if (!result) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }
    return result;
  }

  async deleteSession(sessionId: string, userId: string) {
    const session = await this.getByIdForUser(sessionId, userId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }
    await this.db.db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom("ChatMessage")
        .where("sessionId", "=", sessionId)
        .execute();
      await trx.deleteFrom("ChatSession").where("id", "=", sessionId).execute();
    });
  }

  async touchSession(sessionId: string, userId: string) {
    return this.db.db
      .updateTable("ChatSession")
      .set({ updatedAt: new Date() })
      .where("id", "=", sessionId)
      .where("userId", "=", userId)
      .returningAll()
      .executeTakeFirst();
  }
}