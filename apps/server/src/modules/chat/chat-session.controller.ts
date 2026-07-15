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
import { PermissionsGuard } from "../rbac/permissions.guard";
import { Permissions } from "../rbac/permissions.decorator";
import { PERMISSIONS } from "../rbac/permissions";

/**
 * [Sprint 2+5 + Fix-3 Task 3.1] V3 — chat session controller + 多租户
 *
 * 所有端点 @UseGuards(JwtAuthGuard, PermissionsGuard) + @Permissions(CHAT_QUERY)
 * GET/list 类端点 只需认证,不需要 @Permissions
 */
@Controller("chat/sessions")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ChatSessionController {
  constructor(private readonly sessionService: ChatSessionService) {}

  @Post()
  @Permissions(PERMISSIONS.CHAT_QUERY)
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
  @Permissions(PERMISSIONS.CHAT_QUERY)
  async deleteSession(
    @Param("id") id: string,
    @CurrentUser() user: { sub: string },
  ) {
    await this.sessionService.deleteSession(id, user.sub);
    return { success: true, data: { id } };
  }
}