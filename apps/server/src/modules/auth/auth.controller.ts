import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./auth.guard";
import { CurrentUser } from "./auth.decorators";

/**
 * [Sprint 5] Auth REST endpoints
 *
 *   POST /auth/register   { email, password } → { token, user }
 *   POST /auth/login      { email, password } → { token, user }
 *   GET  /auth/me         (Bearer) → { user }
 *
 * 公共端点(register / login)不需要 JwtAuthGuard;
 * /me 显式 @UseGuards(JwtAuthGuard)。
 */

const EmailPasswordSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(6).max(200),
  name: z.string().max(100).optional(),
  inviteCode: z.string().max(20).optional(),
});

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() body: unknown) {
    const parsed = EmailPasswordSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return {
      success: true,
      data: await this.auth.register({
        email: parsed.data.email,
        password: parsed.data.password,
        name: parsed.data.name,
        inviteCode: parsed.data.inviteCode,
      }),
    };
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: unknown) {
    const parsed = EmailPasswordSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return {
      success: true,
      data: await this.auth.login(parsed.data),
    };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: { sub: string; email: string }) {
    const u = await this.auth.getById(user.sub);
    if (!u) {
      return { success: false, error: { code: "USER_NOT_FOUND", message: "User not found" } };
    }
    return { success: true, data: u };
  }
}