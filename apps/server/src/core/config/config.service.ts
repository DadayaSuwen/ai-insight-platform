import { ConfigService as NestConfigService } from "@nestjs/config";

export class ConfigService extends NestConfigService {
  get DATABASE_URL(): string {
    return (
      this.get<string>("DATABASE_URL") ||
      "postgresql://app:password@localhost:5432/ai_insight"
    );
  }
}

export const configService = new ConfigService();