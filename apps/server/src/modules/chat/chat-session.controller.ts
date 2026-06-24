import {
  Controller,
  Get,
  Post,
  Delete,
  Put,
  Param,
  Body,
} from "@nestjs/common";
import { ChatSessionService } from "./chat-session.service";

@Controller("chat/sessions")
export class ChatSessionController {
  constructor(private readonly sessionService: ChatSessionService) {}

  @Post()
  async createSession(@Body("title") title?: string) {
    const data = await this.sessionService.createSession(title ?? "新对话");
    return { success: true, data };
  }

  @Get()
  async getSessions() {
    return this.sessionService.getSessions();
  }

  @Get(":id/messages")
  async getMessages(@Param("id") id: string) {
    return this.sessionService.getMessagesBySessionId(id);
  }

  @Put(":id")
  async renameSession(
    @Param("id") id: string,
    @Body("title") title: string,
  ) {
    await this.sessionService.updateSessionTitle(id, title);
    return { success: true, data: { id, title } };
  }

  @Delete(":id")
  async deleteSession(@Param("id") id: string) {
    await this.sessionService.deleteSession(id);
    return { success: true, data: { id } };
  }
}
