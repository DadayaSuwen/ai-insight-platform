import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { randomUUID } from "crypto";

@Injectable()
export class ChatSessionService {
  constructor(private readonly db: DatabaseService) {}

  async createSession(title: string = "新对话") {
    const session = await this.db.db
      .insertInto("ChatSession")
      .values({
        title,
        id: randomUUID(), // ★ 这里加上 id
        updatedAt: new Date(), // ★ 这里加上 updatedAt
      })
      .returningAll()
      .executeTakeFirst();
    return session;
  }

  async getSessions() {
    return this.db.db
      .selectFrom("ChatSession")
      .selectAll()
      .orderBy("updatedAt", "desc")
      .execute();
  }

  async getMessagesBySessionId(sessionId: string) {
    return this.db.db
      .selectFrom("ChatMessage")
      .selectAll()
      .where("sessionId", "=", sessionId)
      .orderBy("createdAt", "asc")
      .execute();
  }

  async saveMessage(
    sessionId: string,
    role: string,
    content: string,
    metadata?: Record<string, unknown>,
  ) {
    return this.db.db
      .insertInto("ChatMessage")
      .values({
        id: randomUUID(), // ★ 这里加上 id
        sessionId,
        role,
        content,
        // pg 驱动对 JSONB 列自动处理 JS 对象 → JSON 字符串的转换；
        // 应用层手动 JSON.stringify 是导致后续读取/前端双重 parse 失败的根源。
        // 直接传对象，让驱动做它该做的事。
        metadata: metadata ?? null,
      })
      .returningAll()
      .executeTakeFirst();
  }

  async updateSessionTitle(sessionId: string, title: string) {
    return this.db.db
      .updateTable("ChatSession")
      .set({ title })
      .where("id", "=", sessionId)
      .execute();
  }

  async deleteSession(sessionId: string) {
    // 两表强关联（FK RESTRICT），用事务包保证原子性——
    // 否则中途失败会留孤儿 ChatMessage
    await this.db.db.transaction().execute(async (trx) => {
      // 先删消息（FK 约束是 ON DELETE RESTRICT，不能直接删父表）
      await trx
        .deleteFrom("ChatMessage")
        .where("sessionId", "=", sessionId)
        .execute();
      await trx
        .deleteFrom("ChatSession")
        .where("id", "=", sessionId)
        .execute();
    });
  }

  /** 刷新 updatedAt，让侧栏按最近活跃排序 */
  async touchSession(sessionId: string) {
    return this.db.db
      .updateTable("ChatSession")
      .set({ updatedAt: new Date() })
      .where("id", "=", sessionId)
      .execute();
  }
}
