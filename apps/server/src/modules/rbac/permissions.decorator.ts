import { SetMetadata } from "@nestjs/common";
import type { Permission } from "./permissions";

/**
 * [Sprint 6] @Permissions() 装饰器
 *
 * 用法:
 *   @UseGuards(JwtAuthGuard, PermissionsGuard)
 *   @Permissions('chat:create')
 *   @Post('/chat/message')
 *   async createMessage() { ... }
 */
export const PERMISSIONS_KEY = "permissions";
export const Permissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
