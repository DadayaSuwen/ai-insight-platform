import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  NotFoundException,
} from "@nestjs/common";
import { z } from "zod";
import { DashboardGeneratorService } from "./generator.service";
import { JwtAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/auth.decorators";

/**
 * [Sprint 6] 工作台生成 + 获取
 *
 * POST /api/dashboard/generate      → 生成工作台配置 (LLM)
 * GET  /api/dashboard/:datasourceId  → 获取已生成的工作台
 */

const GenerateSchema = z.object({
  datasourceId: z.string().min(1),
});

@Controller("api/dashboard")
@UseGuards(JwtAuthGuard)
export class DashboardGeneratorController {
  constructor(private readonly generator: DashboardGeneratorService) {}

  @Post("generate")
  async generate(
    @Body() body: unknown,
    @CurrentUser() user: { sub: string },
  ) {
    const parsed = GenerateSchema.parse(body);
    const config = await this.generator.generate(parsed.datasourceId, user.sub);
    return { success: true, data: config };
  }

  @Get(":datasourceId")
  async get(
    @Param("datasourceId") datasourceId: string,
    @CurrentUser() user: { sub: string },
  ) {
    const config = await this.generator.getConfig(datasourceId, user.sub);
    if (!config) {
      throw new NotFoundException("Dashboard not found. Run generate first.");
    }
    return { success: true, data: config };
  }
}
