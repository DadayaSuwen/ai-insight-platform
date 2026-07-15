import { Module } from "@nestjs/common";
import { ChatService } from "./chat.service";
import { ChatController } from "./chat.controller";
import { ChatSessionService } from "./chat-session.service";
import { ChatSessionController } from "./chat-session.controller";
import { AiModule } from "../ai/ai.module";
import { DatabaseModule } from "../database/database.module"; // ★ 引入 DatabaseModule
import { DatasourceModule } from "../datasource/datasource.module";

@Module({
  imports: [AiModule, DatabaseModule, DatasourceModule], // ★ 加入 imports 数组
  controllers: [ChatController, ChatSessionController],
  providers: [ChatService, ChatSessionService],
})
export class ChatModule {}
