import { ConfigService as NestConfigService } from '@nestjs/config';

export class ConfigService extends NestConfigService {
  get DATABASE_URL(): string {
    return this.get<string>('DATABASE_URL') || 'postgresql://app:password@localhost:5432/ai_insight';
  }

  get OLLAMA_BASE_URL(): string {
    return this.get<string>('OLLAMA_BASE_URL') || 'http://localhost:11434';
  }

  get OLLAMA_MODEL(): string {
    return this.get<string>('OLLAMA_MODEL') || 'qwen3:8b';
  }
}

export const configService = new ConfigService();