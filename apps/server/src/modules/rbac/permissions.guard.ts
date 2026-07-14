import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { PERMISSIONS_KEY } from "./permissions.decorator";
import { ROLE_PERMISSIONS, type Permission } from "./permissions";
import { DatabaseService } from "../database/database.service";
import type { JwtPayload } from "../auth/jwt-secret";

/**
 * [Sprint 6] PermissionsGuard — 角色权限校验
 *
 * 先于 JwtAuthGuard 执行 (在同一 @UseGuards 中列在 JwtAuthGuard 之后)。
 * 从 req.user (由 JwtAuthGuard 注入) 读取 userId → 查 DB 取 role →
 * 对照 ROLE_PERMISSIONS 矩阵校验。
 *
 * 用法:
 *   @UseGuards(JwtAuthGuard, PermissionsGuard)
 *   @Permissions('chat:create', 'dashboard:view')
 *   @Post('/chat/message')
 *   async createMessage() { ... }
 *
 * 若路由未标记 @Permissions(), 仅要求已登录 (放行)。
 */

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  /** 缓存 userId→role, 避免每次请求都查 DB */
  private roleCache = new Map<string, { role: string; ts: number }>();
  private readonly CACHE_TTL = 60_000; // 1 分钟

  constructor(
    private readonly reflector: Reflector,
    private readonly db: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 未标记 @Permissions() 的路由 → 放行 (至少已登录, JwtAuthGuard 保证了)
    if (!required || required.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = req.user?.sub;

    if (!userId) {
      throw new ForbiddenException("未登录");
    }

    const role = await this.getUserRole(userId);
    if (!role) {
      throw new ForbiddenException("用户不存在或已禁用");
    }

    const userPerms = ROLE_PERMISSIONS[role];
    if (!userPerms) {
      throw new ForbiddenException(`未知角色: ${role}`);
    }

    const hasAll = required.every((p) => userPerms.includes(p));
    if (!hasAll) {
      const missing = required.filter((p) => !userPerms.includes(p));
      throw new ForbiddenException(
        `权限不足。缺少: ${missing.join(", ")}`,
      );
    }

    return true;
  }

  private async getUserRole(userId: string): Promise<string | null> {
    const cached = this.roleCache.get(userId);
    if (cached && Date.now() - cached.ts < this.CACHE_TTL) {
      return cached.role;
    }

    const user = await this.db.db
      .selectFrom("User")
      .select(["role", "status"])
      .where("id", "=", userId)
      .executeTakeFirst();

    if (!user || user.status !== "active") return null;

    this.roleCache.set(userId, { role: user.role, ts: Date.now() });
    return user.role;
  }
}
