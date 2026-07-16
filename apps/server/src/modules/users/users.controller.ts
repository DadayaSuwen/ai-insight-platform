import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Put,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { z } from "zod";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import { randomUUID } from "crypto";
import { JwtAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/auth.decorators";
import { PermissionsGuard } from "../rbac/permissions.guard";
import { Permissions } from "../rbac/permissions.decorator";
import { PERMISSIONS } from "../rbac/permissions";
import { DatabaseService } from "../database/database.service";

/**
 * [Sprint 6] UsersController — 用户管理 + 邀请码
 *
 * 仅管理员可见:
 *   GET    /api/users           → 用户列表
 *   POST   /api/users           → 创建用户
 *   PUT    /api/users/:id       → 编辑用户 (角色/状态)
 *   POST   /api/invite-codes    → 生成邀请码
 */

const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
  role: z.string().min(1).max(64).default("analyst"),
  customRoleId: z.string().uuid().optional().nullable(),
});

const UpdateUserSchema = z.object({
  role: z.string().min(1).max(64).optional(), // 允许自定义角色 name
  status: z.enum(["active", "disabled"]).optional(),
  name: z.string().optional(),
  customRoleId: z.string().uuid().optional().nullable(),
});

const InviteCodeCreateSchema = z.object({
  maxUses: z.number().int().positive().default(10),
  expiresInDays: z.number().int().positive().optional(),
});

@Controller("api")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly db: DatabaseService) {}

  @Get("users")
  @Permissions(PERMISSIONS.USER_MANAGE)
  async list() {
    const users = await this.db.db
      .selectFrom("User")
      .select(["id", "email", "name", "role", "status", "customRoleId", "createdAt", "updatedAt"])
      .orderBy("createdAt", "desc")
      .execute();
    return { success: true, data: users };
  }

  @Post("users")
  @Permissions(PERMISSIONS.USER_MANAGE)
  async create(@Body() body: unknown) {
    try {
      const parsed = CreateUserSchema.parse(body);
      const passwordHash = await bcrypt.hash(parsed.password, 10);

      const created = await this.db.db
        .insertInto("User")
        .values({
          id: randomUUID(),
          email: parsed.email,
          passwordHash,
          name: parsed.name ?? null,
          role: parsed.role,
          status: "active",
          customRoleId: parsed.customRoleId ?? null,
          updatedAt: new Date(),
        })
        .returning(["id", "email", "name", "role", "status", "customRoleId"])
        .executeTakeFirstOrThrow();

      return { success: true, data: created };
    } catch (err) {
      this.logger.error(
        `POST /api/users failed: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw err;
    }
  }

  @Put("users/:id")
  @Permissions(PERMISSIONS.USER_MANAGE)
  async update(@Param("id") id: string, @Body() body: unknown) {
    const parsed = UpdateUserSchema.parse(body);

    const existing = await this.db.db
      .selectFrom("User")
      .select("id")
      .where("id", "=", id)
      .executeTakeFirst();
    if (!existing) throw new NotFoundException("User not found");

    const setUpdate: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.role !== undefined) setUpdate.role = parsed.role;
    if (parsed.status !== undefined) setUpdate.status = parsed.status;
    if (parsed.name !== undefined) setUpdate.name = parsed.name;
    if (parsed.customRoleId !== undefined) setUpdate.customRoleId = parsed.customRoleId;

    await this.db.db
      .updateTable("User")
      .set(setUpdate as Record<string, never>)
      .where("id", "=", id)
      .execute();

    return { success: true };
  }

  @Delete("users/:id")
  @Permissions(PERMISSIONS.USER_MANAGE)
  async delete(@Param("id") id: string, @CurrentUser() user: { sub: string }) {
    if (id === user.sub) {
      throw new BadRequestException("不能删除自己");
    }

    const target = await this.db.db
      .selectFrom("User")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    if (!target) throw new NotFoundException("User not found");

    // 至少保留 1 个活跃管理员
    if (target.role === "admin" && target.status === "active") {
      const admins = await this.db.db
        .selectFrom("User")
        .select("id")
        .where("role", "=", "admin")
        .where("status", "=", "active")
        .execute();
      if (admins.length <= 1) {
        throw new BadRequestException("至少保留 1 个活跃管理员");
      }
    }

    await this.db.db.deleteFrom("User").where("id", "=", id).execute();
    return { success: true };
  }

  @Post("invite-codes")
  @Permissions(PERMISSIONS.USER_MANAGE)
  async createInviteCode(
    @Body() body: unknown,
    @CurrentUser() user: { sub: string },
  ) {
    const parsed = InviteCodeCreateSchema.parse(body);
    // [Fix-3 Task 3.6] 邀请码 16 字节 = 32 hex 字符 = 128 bit 熵, 防止爆破
    const code = crypto.randomBytes(16).toString("hex").toUpperCase();

    const expiresAt = parsed.expiresInDays
      ? new Date(Date.now() + parsed.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const created = await this.db.db
      .insertInto("InviteCode")
      .values({
        code,
        createdBy: user.sub,
        maxUses: parsed.maxUses,
        usedCount: 0,
        expiresAt,
        createdAt: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return { success: true, data: created };
  }

  @Get("invite-codes")
  @Permissions(PERMISSIONS.USER_MANAGE)
  async listInviteCodes() {
    const codes = await this.db.db
      .selectFrom("InviteCode")
      .selectAll()
      .orderBy("createdAt", "desc")
      .execute();
    return { success: true, data: codes };
  }

  @Delete("invite-codes/:id")
  @Permissions(PERMISSIONS.USER_MANAGE)
  async revokeInviteCode(@Param("id") id: string) {
    const existing = await this.db.db
      .selectFrom("InviteCode")
      .select("id")
      .where("id", "=", id)
      .executeTakeFirst();
    if (!existing) throw new NotFoundException("InviteCode not found");
    await this.db.db.deleteFrom("InviteCode").where("id", "=", id).execute();
    return { success: true };
  }
}
