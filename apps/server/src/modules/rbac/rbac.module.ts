import { Module, Global } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PermissionsGuard } from "./permissions.guard";

/**
 * [Sprint 6] RbacModule — 全局 RBAC 模块
 *
 * 导出 PermissionsGuard 供所有模块使用。
 * @Global 避免每个 module 都要 import。
 */
@Global()
@Module({
  imports: [DatabaseModule],
  providers: [PermissionsGuard],
  exports: [PermissionsGuard],
})
export class RbacModule {}
