import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { verifyJwt, type JwtPayload } from "./jwt-secret";
import { DatabaseService } from "../database/database.service";

/**
 * [Sprint 5 + Fix-3 Task 3.3] JwtAuthGuard — Bearer token 校验 + User.status 校验
 *
 * 用法:
 *   @UseGuards(JwtAuthGuard)
 *   @Get('me')
 *   me(@Req() req: Request) { return req.user; }
 *
 * 失败:
 *   - 无 Authorization 头 / 格式错 → 401
 *   - 签名错 / 过期 → 401
 *   - User 不存在 / status !== 'active' → 401 (账号已停用)
 *
 * 性能: 30 秒内存缓存 user 状态, 避免每个请求都查 DB
 * 缓存粒度: Map<userId, { user, ts }>, 缓存 key = payload.sub
 *
 * 成功后:req.user = { sub, email, role } (从 DB 读取, 比 JWT payload 更可信)
 */

export interface AuthenticatedRequest extends Request {
  user: JwtPayload & { email?: string; role?: string };
}

interface CachedUser {
  user: { id: string; email: string; role: string; status: string };
  ts: number;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  /** 30 秒缓存 — 减少 JWT 验证后重复查 DB */
  private readonly userCache = new Map<string, CachedUser>();
  private readonly CACHE_TTL = 30_000;

  constructor(private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing Bearer token");
    }
    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      throw new UnauthorizedException("Empty token");
    }

    let payload: JwtPayload;
    try {
      payload = verifyJwt(token);
    } catch (err) {
      throw new UnauthorizedException(
        `Invalid token: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // [Fix-3 Task 3.3] 查 DB 确认用户仍 active (带缓存)
    const cached = this.userCache.get(payload.sub);
    let user: { id: string; email: string; role: string; status: string } | null = null;

    if (cached && Date.now() - cached.ts < this.CACHE_TTL) {
      user = cached.user;
    } else {
      const row = await this.db.db
        .selectFrom("User")
        .select(["id", "email", "role", "status"])
        .where("id", "=", payload.sub)
        .executeTakeFirst();
      if (row) {
        user = {
          id: row.id,
          email: row.email,
          role: row.role,
          status: row.status,
        };
        this.userCache.set(payload.sub, { user, ts: Date.now() });
      }
    }

    if (!user || user.status !== 'active') {
      // 失效缓存 (避免 disabled 切换后被缓存复用)
      this.userCache.delete(payload.sub);
      throw new UnauthorizedException("账号已停用或不存在");
    }

    // 用 DB 真实数据覆盖 JWT payload, 防止 token 包含过期 role/email
    req.user = {
      ...payload,
      email: user.email,
      role: user.role,
    };
    return true;
  }
}
