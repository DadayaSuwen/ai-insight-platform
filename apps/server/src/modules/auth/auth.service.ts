import { Injectable, Logger, UnauthorizedException, ConflictException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { DatabaseService } from "../database/database.service";
import { signJwt } from "./jwt-secret";

/**
 * [Sprint 5] AuthService — 注册 / 登录
 *
 * - 密码用 bcrypt 哈希(默认 cost = 10, ~80ms / hash)
 * - 邮箱唯一(unique index 由 Prisma 自动加)
 * - 返回 token + user
 *
 * 默认用户(id = 00000000-0000-0000-0000-000000000000, email = demo@local.dev)
 * 由 Sprint 5 迁移自动创建,密码已在 SQL 中预哈希(demo123),直接可用。
 */

export interface AuthenticatedUser {
  id: string;
  email: string;
}

const BCRYPT_COST = 10;
const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000000";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * 注册新用户。
   * - email 已存在 → 409 Conflict
   * - password < 6 chars → 400 BadRequest(由 controller 校验)
   * - 创建后立即签发 token
   */
  async register(opts: {
    email: string;
    password: string;
  }): Promise<{ token: string; user: AuthenticatedUser }> {
    const email = opts.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(opts.password, BCRYPT_COST);

    const existing = await this.db.db
      .selectFrom("User")
      .select("id")
      .where("email", "=", email)
      .executeTakeFirst();

    if (existing) {
      throw new ConflictException("Email already registered");
    }

    const created = await this.db.db
      .insertInto("User")
      .values({
        email,
        passwordHash,
        updatedAt: new Date(),
      })
      .returning(["id", "email"])
      .executeTakeFirstOrThrow();

    this.logger.log(`User registered: ${created.email} (${created.id})`);
    const token = signJwt({ sub: created.id, email: created.email });
    return { token, user: { id: created.id, email: created.email } };
  }

  /**
   * 登录:邮箱 + 密码。
   * - 用户不存在 / 密码错 → 401 Unauthorized(统一文案,避免泄露账号存在性)
   * - 成功 → 签发 token
   */
  async login(opts: {
    email: string;
    password: string;
  }): Promise<{ token: string; user: AuthenticatedUser }> {
    const email = opts.email.trim().toLowerCase();

    const user = await this.db.db
      .selectFrom("User")
      .select(["id", "email", "passwordHash"])
      .where("email", "=", email)
      .executeTakeFirst();

    if (!user) {
      throw new UnauthorizedException("Invalid email or password");
    }
    const ok = await bcrypt.compare(opts.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const token = signJwt({ sub: user.id, email: user.email });
    this.logger.log(`User login: ${user.email} (${user.id})`);
    return { token, user: { id: user.id, email: user.email } };
  }

  /**
   * 通过 userId 查用户(GET /auth/me 用)
   */
  async getById(id: string): Promise<AuthenticatedUser | null> {
    const user = await this.db.db
      .selectFrom("User")
      .select(["id", "email"])
      .where("id", "=", id)
      .executeTakeFirst();
    return user ?? null;
  }

  /**
   * 启动时:兼容旧数据 — 若默认用户 email 仍是 default@local 或
   * passwordHash 仍是 PLACEHOLDER_WILL_BE_REPLACED,统一升级为
   * demo@local.dev / demo123 (通过 Zod 校验的合法凭据)。
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const u = await this.db.db
        .selectFrom("User")
        .select(["id", "email", "passwordHash"])
        .where("id", "=", DEFAULT_USER_ID)
        .executeTakeFirst();

      if (!u) return;

      const needsFix =
        u.email === "default@local" ||
        u.passwordHash === "PLACEHOLDER_WILL_BE_REPLACED";

      if (needsFix) {
        const hash = await bcrypt.hash("demo123", BCRYPT_COST);
        await this.db.db
          .updateTable("User")
          .set({
            email: "demo@local.dev",
            passwordHash: hash,
            updatedAt: new Date(),
          })
          .where("id", "=", DEFAULT_USER_ID)
          .execute();
        this.logger.log(
          "Default user upgraded to demo@local.dev / demo123 (dev only)",
        );
      }
    } catch (err) {
      this.logger.warn(
        `Failed to seed default user: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}