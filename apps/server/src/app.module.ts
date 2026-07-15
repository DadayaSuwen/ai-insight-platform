import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ChatModule } from './modules/chat/chat.module';
import { DatabaseModule } from './modules/database/database.module';
import { AiModule } from './modules/ai/ai.module';
import { DatasourceModule } from './modules/datasource/datasource.module';
// [Sprint 5] 多租户鉴权
import { AuthModule } from './modules/auth/auth.module';
// [Sprint 6] RBAC 权限模块
import { RbacModule } from './modules/rbac/rbac.module';
// [Sprint 6] Schema 自主探索
import { SchemaExplorerModule } from './modules/schema-explorer/explore.module';
// [Sprint 6] Schema 纠错对话
import { SchemaReviewModule } from './modules/schema-review/review.module';
// [Sprint 6] 工作台自动生成
import { DashboardGeneratorModule } from './modules/dashboard-generator/generator.module';
// [Sprint 6] 主动洞察定时巡检
import { InsightModule } from './modules/insights/insight.module';
// [Sprint 6] 用户管理 + 邀请码
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // [Fix-3 Task 3.4] 全局限流 — 默认每分钟 30 次
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 30,
      },
    ]),
    ChatModule,
    DatabaseModule,
    AiModule,
    // [Sprint 1] V3 多数据源注册表 + 元数据服务 + 查询网关
    DatasourceModule,
    // [Sprint 5] 注册 / 登录 / JWT 签发 / 默认用户密码初始化
    AuthModule,
    // [Sprint 6] RBAC 权限校验 (全局导出 PermissionsGuard)
    RbacModule,
    // [Sprint 6] Schema 自主探索
    SchemaExplorerModule,
    // [Sprint 6] Schema 纠错对话
    SchemaReviewModule,
    // [Sprint 6] 工作台自动生成
    DashboardGeneratorModule,
    // [Sprint 6] 主动洞察定时巡检
    InsightModule,
    // [Sprint 6] 用户管理 + 邀请码
    UsersModule,
  ],
  providers: [
    // [Fix-3 Task 3.4] 全局 ThrottlerGuard — 兜底所有路由
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}