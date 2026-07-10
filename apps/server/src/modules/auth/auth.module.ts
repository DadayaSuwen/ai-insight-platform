import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./auth.guard";

/**
 * [Sprint 5] AuthModule
 *
 * 装配:
 *   - AuthController:register/login/me
 *   - AuthService:注册 / 登录 / 用户查询 / 默认用户密码初始化
 *   - JwtAuthGuard:导出供其他 module 引用(@UseGuards)
 *
 * 不导出 Controller,只导出 service + guard。
 * DatasourceModule / ChatModule 自行 import AuthModule 获取 JwtAuthGuard。
 */
@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}