import { z } from 'zod';
// ============================================
// Database Query Schemas
// ============================================
/**
 * Database query request
 */
export const DatabaseQueryRequestSchema = z.object({
    sql: z.string().min(1, { message: 'SQL 查询不能为空' }),
    params: z.record(z.unknown()).optional(),
});
/**
 * Database query result row (generic)
 */
export const DatabaseRowSchema = z.record(z.unknown());
/**
 * Database query response
 */
export const DatabaseQueryResponseSchema = z.object({
    rows: z.array(DatabaseRowSchema),
    rowCount: z.number(),
    affectedRows: z.number().optional(),
});
// ============================================
// Database Schema Schemas
// ============================================
/**
 * Column information
 */
export const ColumnInfoSchema = z.object({
    name: z.string(),
    type: z.string(),
    dataType: z.string(),
    nullable: z.boolean(),
    isPrimaryKey: z.boolean().default(false),
    isForeignKey: z.boolean().default(false),
    defaultValue: z.unknown().optional(),
    maxLength: z.number().optional(),
});
/**
 * Table schema
 */
export const TableSchemaSchema = z.object({
    name: z.string(),
    schema: z.string().default('public'),
    columns: z.array(ColumnInfoSchema),
    primaryKey: z.array(z.string()).optional(),
    foreignKeys: z
        .array(z.object({
        columns: z.array(z.string()),
        referencedTable: z.string(),
        referencedColumns: z.array(z.string()),
    }))
        .optional(),
});
/**
 * Database schema response
 */
export const DatabaseSchemaResponseSchema = z.object({
    database: z.string(),
    tables: z.array(TableSchemaSchema),
    totalTables: z.number(),
});
// ============================================
// Database Table Names
// ============================================
/**
 * Available database tables
 */
export const DatabaseTablesSchema = z.enum(['Sales', 'ChatSession', 'ChatMessage']);
// ============================================
// Validation Helper Functions
// ============================================
/**
 * Validate database query request
 */
export function validateDatabaseQueryRequest(data) {
    return DatabaseQueryRequestSchema.parse(data);
}
/**
 * Safe parse database query request
 */
export function safeParseDatabaseQueryRequest(data) {
    return DatabaseQueryRequestSchema.safeParse(data).success
        ? DatabaseQueryRequestSchema.parse(data)
        : null;
}
/**
 * Validate SQL query (basic validation)
 * Note: This is a simple validation, not a full SQL parser
 */
export function isValidSQL(sql) {
    const trimmed = sql.trim().toUpperCase();
    const forbidden = ['DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'CREATE', 'INSERT', 'UPDATE'];
    return !forbidden.some((kw) => trimmed.startsWith(kw));
}
