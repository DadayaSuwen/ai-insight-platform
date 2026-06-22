import { z } from 'zod';
// Database Query Request Schema
export const QueryRequestSchema = z.object({
    sql: z.string().min(1),
});
// Database Schema Response Schema
export const TableSchemaSchema = z.object({
    name: z.string(),
    columns: z.array(z.object({
        name: z.string(),
        type: z.string(),
        nullable: z.boolean(),
        isPrimaryKey: z.boolean(),
    })),
});
export const DatabaseSchemaSchema = z.object({
    tables: z.array(TableSchemaSchema),
});
