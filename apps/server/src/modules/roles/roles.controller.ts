/**
 * [Sprint 5.7+] Roles 管理 — 自定义角色 CRUD
 *
 *   GET    /api/roles           → 列出所有角色 (系统+自定义)
 *   GET    /api/roles/:id       → 详情
 *   POST   /api/roles           → 创建自定义角色
 *   PUT    /api/roles/:id       → 编辑 (label/description/permissions)
 *   DELETE /api/roles/:id       → 删除自定义角色 (系统角色 → 403)
 *
 * 所有端点需 ROLE_MANAGE 权限 (admin 角色内置)。
 */
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { z } from "zod";
import { JwtAuthGuard } from "../auth/auth.guard";
import { PermissionsGuard } from "../rbac/permissions.guard";
import { Permissions } from "../rbac/permissions.decorator";
import { PERMISSIONS } from "../rbac/permissions";
import { DatabaseService } from "../database/database.service";

const PERM_ENUM = z.enum([
  PERMISSIONS.VIEW_DASHBOARD,
  PERMISSIONS.CHAT_QUERY,
  PERMISSIONS.VIEW_INSIGHTS,
  PERMISSIONS.DISMISS_INSIGHTS,
  PERMISSIONS.CONNECT_DATASOURCE,
  PERMISSIONS.SCHEMA_REVIEW,
  PERMISSIONS.EXPORT_REPORT,
  PERMISSIONS.USER_MANAGE,
  PERMISSIONS.ROLE_MANAGE,
  PERMISSIONS.LLM_CONFIG,
  PERMISSIONS.AUDIT_LOG,
]);

const CreateRoleSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9_-]+$/, "name 只能包含小写字母、数字、_、-"),
  label: z.string().min(1).max(64),
  description: z.string().max(500).optional(),
  permissions: z.array(PERM_ENUM).default([]),
});

const UpdateRoleSchema = z.object({
  label: z.string().min(1).max(64).optional(),
  description: z.string().max(500).optional().nullable(),
  permissions: z.array(PERM_ENUM).optional(),
});

const RESERVED_NAMES = new Set(["admin", "analyst", "viewer"]);

@Controller("api/roles")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  @Permissions(PERMISSIONS.ROLE_MANAGE)
  async list() {
    const rows = await this.db.db
      .selectFrom("Role")
      .selectAll()
      .orderBy("createdAt", "asc")
      .execute();
    const data = rows.map((r) => ({
      ...r,
      permissions: this.parsePermissions(r.permissions),
    }));
    return { success: true, data };
  }

  @Get(":id")
  @Permissions(PERMISSIONS.ROLE_MANAGE)
  async get(@Param("id") id: string) {
    const row = await this.db.db
      .selectFrom("Role")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    if (!row) throw new NotFoundException("Role not found");
    return {
      success: true,
      data: { ...row, permissions: this.parsePermissions(row.permissions) },
    };
  }

  @Post()
  @Permissions(PERMISSIONS.ROLE_MANAGE)
  async create(@Body() body: unknown) {
    const parsed = CreateRoleSchema.parse(body);
    if (RESERVED_NAMES.has(parsed.name)) {
      throw new ForbiddenException(`保留名 ${parsed.name} 不能用作自定义角色`);
    }
    const existing = await this.db.db
      .selectFrom("Role")
      .select("id")
      .where("name", "=", parsed.name)
      .executeTakeFirst();
    if (existing) {
      throw new ForbiddenException(`角色名 ${parsed.name} 已存在`);
    }
    const created = await this.db.db
      .insertInto("Role")
      .values({
        id: randomUUID(),
        name: parsed.name,
        label: parsed.label,
        description: parsed.description ?? null,
        permissions: JSON.stringify(parsed.permissions),
        isSystem: false,
        updatedAt: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return {
      success: true,
      data: { ...created, permissions: parsed.permissions },
    };
  }

  @Put(":id")
  @Permissions(PERMISSIONS.ROLE_MANAGE)
  async update(@Param("id") id: string, @Body() body: unknown) {
    const parsed = UpdateRoleSchema.parse(body);
    const existing = await this.db.db
      .selectFrom("Role")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    if (!existing) throw new NotFoundException("Role not found");
    if (existing.isSystem) {
      throw new ForbiddenException("系统角色不可修改");
    }

    const setUpdate: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.label !== undefined) setUpdate.label = parsed.label;
    if (parsed.description !== undefined)
      setUpdate.description = parsed.description;
    if (parsed.permissions !== undefined)
      setUpdate.permissions = JSON.stringify(parsed.permissions);

    const updated = await this.db.db
      .updateTable("Role")
      .set(setUpdate as Record<string, never>)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return {
      success: true,
      data: {
        ...updated,
        permissions: this.parsePermissions(updated.permissions),
      },
    };
  }

  @Delete(":id")
  @Permissions(PERMISSIONS.ROLE_MANAGE)
  async delete(@Param("id") id: string) {
    const existing = await this.db.db
      .selectFrom("Role")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    if (!existing) throw new NotFoundException("Role not found");
    if (existing.isSystem) {
      throw new ForbiddenException("系统角色不可删除");
    }
    // 清空引用此角色的 User.customRoleId (FK 已 SetNull)
    await this.db.db.deleteFrom("Role").where("id", "=", id).execute();
    return { success: true };
  }

  private parsePermissions(raw: string): string[] {
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
}