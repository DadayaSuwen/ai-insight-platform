import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatModule } from './modules/chat/chat.module';
import { DatabaseModule } from './modules/database/database.module';
import { AiModule } from './modules/ai/ai.module';
import { DatasourceModule } from './modules/datasource/datasource.module';
// [Sprint 5] 多租户鉴权
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ChatModule,
    DatabaseModule,
    AiModule,
    // [Sprint 1] V3 多数据源注册表 + 元数据服务 + 查询网关
    DatasourceModule,
    // [Sprint 5] 注册 / 登录 / JWT 签发 / 默认用户密码初始化
    AuthModule,
  ],
})
export class AppModule {}