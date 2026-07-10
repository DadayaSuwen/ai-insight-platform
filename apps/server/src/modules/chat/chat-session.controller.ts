import {
  Controller,
  Get,
  Post,
  Delete,
  Put,
  Param,
  Body,
  UseGuards,
} from "@nestjs/common";
import { ChatSessionService } from "./chat-session.service";
import { JwtAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/auth.decorators";

/**
 * [Sprint 2+5] V3 — chat session controller + 多租户
 *
 * 所有端点 @UseGuards(JwtAuthGuard),session 强归属 currentUser。
 */
@Controller("chat/sessions")
@UseGuards(JwtAuthGuard)
export class ChatSessionController {
  constructor(private readonly sessionService: ChatSessionService) {}

  @Post()
  async createSession(
    @CurrentUser() user: { sub: string },
    @Body("title") title?: string,
    @Body("dataSourceId") dataSourceId?: string,
  ) {
    const data = await this.sessionService.createSession({
      userId: user.sub, // [Sprint 5]
      title: title ?? "新对话",
      dataSourceId: dataSourceId ?? null,
    });
    return { success: true, data };
  }

  @Get()
  async getSessions(@CurrentUser() user: { sub: string }) {
    const data = await this.sessionService.getSessionsForUser(user.sub);
    return { success: true, data };
  }

  @Get(":id/messages")
  async getMessages(
    @Param("id") id: string,
    @CurrentUser() user: { sub: string },
  ) {
    const data = await this.sessionService.getMessagesBySessionId(id, user.sub);
    return { success: true, data };
  }

  @Put(":id")
  async renameSession(
    @Param("id") id: string,
    @CurrentUser() user: { sub: string },
    @Body("title") title: string,
  ) {
    const data = await this.sessionService.updateSessionTitle(id, user.sub, title);
    return { success: true, data };
  }

  @Delete(":id")
  async deleteSession(
    @Param("id") id: string,
    @CurrentUser() user: { sub: string },
  ) {
    await this.sessionService.deleteSession(id, user.sub);
    return { success: true, data: { id } };
  }
}