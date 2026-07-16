import {
  Controller,
  Get,
  Query,
  Sse,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { ExploreService } from "./explore.service";
import { JwtAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/auth.decorators";
import { PermissionsGuard } from "../rbac/permissions.guard";
import { Permissions } from "../rbac/permissions.decorator";
import { PERMISSIONS } from "../rbac/permissions";

/**
 * [Sprint 6 + Fix-3 Task 3.1] Schema 探索 SSE 端点
 *
 * GET /api/schema/explore?datasourceId=xxx
 *
 * SSE Events:
 *   event: step
 *   data: {"step":1,"name":"connecting","status":"done","detail":"..."}
 *
 *   event: done
 *   data: {"reviewNeeded":true,"pendingFields":4}
 *
 * 复用 JwtAuthGuard + PermissionsGuard, 校验数据源所有权在 ExploreService 内部完成。
 */
@Controller("api/schema")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExploreController {
  constructor(private readonly exploreService: ExploreService) {}

  @Sse("explore")
  @Permissions(PERMISSIONS.CONNECT_DATASOURCE)
  explore(
    @Query("datasourceId") datasourceId: string,
    @CurrentUser() user: { sub: string },
  ): Observable<{ type: string; data: unknown }> {
    if (!datasourceId) {
      throw new BadRequestException("datasourceId is required");
    }

    return new Observable((subscriber) => {
      void (async () => {
        try {
          for await (const event of this.exploreService.explore(
            datasourceId,
            user.sub,
          )) {
            subscriber.next(event as unknown as { type: string; data: unknown });
          }
        } catch (err) {
          subscriber.next({
            type: "error",
            data: { message: (err as Error).message },
          } as unknown as { type: string; data: unknown });
        }
        subscriber.complete();
      })();
    });
  }
}
