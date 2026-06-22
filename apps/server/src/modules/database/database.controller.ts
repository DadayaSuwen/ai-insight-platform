import { Controller, Post, Body, Get } from '@nestjs/common';
import { DatabaseService } from './database.service';

@Controller('database')
export class DatabaseController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Post('query')
  async executeQuery(@Body('sql') sql: string) {
    return this.databaseService.executeQuery(sql);
  }

  @Get('schema')
  async getSchema() {
    return this.databaseService.getSchema();
  }
}