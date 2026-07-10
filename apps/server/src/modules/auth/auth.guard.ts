import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { verifyJwt, type JwtPayload } from "./jwt-secret";

/**
 * [Sprint 5] JwtAuthGuard — Bearer token 校验
 *
 * 用法:
 *   @UseGuards(JwtAuthGuard)
 *   @Get('me')
 *   me(@Req() req: Request) { return req.user; }
 *
 * 失败:
 *   - 无 Authorization 头 / 格式错 → 401
 *   - 签名错 / 过期 → 401
 *
 * 成功后:req.user = JwtPayload = { sub, email, iat, exp }
 *
 * 配合 @CurrentUser() decorator 提取 req.user:
 *   import { CurrentUser } from './auth.decorators';
 *   me(@CurrentUser() user: JwtPayload) { ... }
 */

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing Bearer token");
    }
    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      throw new UnauthorizedException("Empty token");
    }
    try {
      const payload = verifyJwt(token);
      req.user = payload;
      return true;
    } catch (err) {
      throw new UnauthorizedException(
        `Invalid token: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}