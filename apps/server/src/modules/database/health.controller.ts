import { Controller, Get } from '@nestjs/common';
import { sql } from 'kysely';
import { DatabaseService } from './database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async health() {
    await sql`select 1`.execute(this.database.db);
    return { status: 'ok' };
  }
}
