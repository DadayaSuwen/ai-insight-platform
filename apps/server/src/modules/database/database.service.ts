import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/core/prisma';

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(private readonly prisma: PrismaService) {}

  async executeQuery(sql: string): Promise<unknown[]> {
    try {
      // WARNING: This is a simple implementation for demo purposes
      // In production, use parameterized queries or a query builder
      const result = await this.prisma.$queryRawUnsafe(sql);
      return result as unknown[];
    } catch (error) {
      this.logger.error(`Query execution failed: ${error.message}`);
      throw error;
    }
  }

  async getSchema(): Promise<unknown> {
    const tables = await this.prisma.$queryRawUnsafe(`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);
    return tables;
  }
}