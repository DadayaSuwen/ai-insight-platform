import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { JwtPayload } from "./jwt-secret";

/**
 * [Sprint 5] @CurrentUser() — 提取 req.user(JwtPayload)
 *
 * 用法:
 *   @UseGuards(JwtAuthGuard)
 *   @Get('me')
 *   me(@CurrentUser() user: JwtPayload) { return user; }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as JwtPayload;
  },
);