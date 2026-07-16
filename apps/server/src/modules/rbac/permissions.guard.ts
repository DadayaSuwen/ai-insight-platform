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

interface CachedPerms {
  /** 系统角色 (admin/analyst/viewer) 的内置权限 */
  systemPerms: Permission[];
  /** 自定义角色追加的权限 (若 user 有 customRoleId) */
  customPerms: Permission[];
  ts: number;
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  /** 缓存 userId→合并后的权限列表, 避免每次请求都查 DB */
  private permCache = new Map<string, CachedPerms>();
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

    const { systemPerms, customPerms } = await this.getUserPerms(userId);
    if (systemPerms === null) {
      throw new ForbiddenException("用户不存在或已禁用");
    }

    const userPerms = [...new Set([...systemPerms, ...customPerms])];

    const hasAll = required.every((p) => userPerms.includes(p));
    if (!hasAll) {
      const missing = required.filter((p) => !userPerms.includes(p));
      throw new ForbiddenException(
        `权限不足。缺少: ${missing.join(", ")}`,
      );
    }

    return true;
  }

  private async getUserPerms(userId: string): Promise<CachedPerms> {
    const cached = this.permCache.get(userId);
    if (cached && Date.now() - cached.ts < this.CACHE_TTL) {
      return cached;
    }

    const user = await this.db.db
      .selectFrom("User")
      .select(["role", "status", "customRoleId"])
      .where("id", "=", userId)
      .executeTakeFirst();

    if (!user || user.status !== "active") {
      return { systemPerms: null as unknown as Permission[], customPerms: [], ts: Date.now() };
    }

    const systemPerms = (ROLE_PERMISSIONS[user.role] ?? []) as Permission[];
    let customPerms: Permission[] = [];
    if (user.customRoleId) {
      const customRole = await this.db.db
        .selectFrom("Role")
        .select(["permissions"])
        .where("id", "=", user.customRoleId)
        .executeTakeFirst();
      if (customRole) {
        try {
          const arr = JSON.parse(customRole.permissions);
          if (Array.isArray(arr)) customPerms = arr as Permission[];
        } catch {
          /* 损坏的 JSON 视为空 */
        }
      }
    }

    const entry = { systemPerms, customPerms, ts: Date.now() };
    this.permCache.set(userId, entry);
    return entry;
  }
}
