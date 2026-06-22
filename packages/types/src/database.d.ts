import { z } from 'zod';
/**
 * Database query request
 */
export declare const DatabaseQueryRequestSchema: z.ZodObject<{
    sql: z.ZodString;
    params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    sql: string;
    params?: Record<string, unknown> | undefined;
}, {
    sql: string;
    params?: Record<string, unknown> | undefined;
}>;
export type DatabaseQueryRequest = z.infer<typeof DatabaseQueryRequestSchema>;
/**
 * Database query result row (generic)
 */
export declare const DatabaseRowSchema: z.ZodType<Record<string, unknown>>;
/**
 * Database query response
 */
export declare const DatabaseQueryResponseSchema: z.ZodObject<{
    rows: z.ZodArray<z.ZodType<Record<string, unknown>, z.ZodTypeDef, Record<string, unknown>>, "many">;
    rowCount: z.ZodNumber;
    affectedRows: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    rows: Record<string, unknown>[];
    rowCount: number;
    affectedRows?: number | undefined;
}, {
    rows: Record<string, unknown>[];
    rowCount: number;
    affectedRows?: number | undefined;
}>;
export type DatabaseQueryResponse = z.infer<typeof DatabaseQueryResponseSchema>;
/**
 * Column information
 */
export declare const ColumnInfoSchema: z.ZodObject<{
    name: z.ZodString;
    type: z.ZodString;
    dataType: z.ZodString;
    nullable: z.ZodBoolean;
    isPrimaryKey: z.ZodDefault<z.ZodBoolean>;
    isForeignKey: z.ZodDefault<z.ZodBoolean>;
    defaultValue: z.ZodOptional<z.ZodUnknown>;
    maxLength: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    type: string;
    name: string;
    dataType: string;
    nullable: boolean;
    isPrimaryKey: boolean;
    isForeignKey: boolean;
    defaultValue?: unknown;
    maxLength?: number | undefined;
}, {
    type: string;
    name: string;
    dataType: string;
    nullable: boolean;
    isPrimaryKey?: boolean | undefined;
    isForeignKey?: boolean | undefined;
    defaultValue?: unknown;
    maxLength?: number | undefined;
}>;
export type ColumnInfo = z.infer<typeof ColumnInfoSchema>;
/**
 * Table schema
 */
export declare const TableSchemaSchema: z.ZodObject<{
    name: z.ZodString;
    schema: z.ZodDefault<z.ZodString>;
    columns: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
        dataType: z.ZodString;
        nullable: z.ZodBoolean;
        isPrimaryKey: z.ZodDefault<z.ZodBoolean>;
        isForeignKey: z.ZodDefault<z.ZodBoolean>;
        defaultValue: z.ZodOptional<z.ZodUnknown>;
        maxLength: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        type: string;
        name: string;
        dataType: string;
        nullable: boolean;
        isPrimaryKey: boolean;
        isForeignKey: boolean;
        defaultValue?: unknown;
        maxLength?: number | undefined;
    }, {
        type: string;
        name: string;
        dataType: string;
        nullable: boolean;
        isPrimaryKey?: boolean | undefined;
        isForeignKey?: boolean | undefined;
        defaultValue?: unknown;
        maxLength?: number | undefined;
    }>, "many">;
    primaryKey: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    foreignKeys: z.ZodOptional<z.ZodArray<z.ZodObject<{
        columns: z.ZodArray<z.ZodString, "many">;
        referencedTable: z.ZodString;
        referencedColumns: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        columns: string[];
        referencedTable: string;
        referencedColumns: string[];
    }, {
        columns: string[];
        referencedTable: string;
        referencedColumns: string[];
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    name: string;
    schema: string;
    columns: {
        type: string;
        name: string;
        dataType: string;
        nullable: boolean;
        isPrimaryKey: boolean;
        isForeignKey: boolean;
        defaultValue?: unknown;
        maxLength?: number | undefined;
    }[];
    primaryKey?: string[] | undefined;
    foreignKeys?: {
        columns: string[];
        referencedTable: string;
        referencedColumns: string[];
    }[] | undefined;
}, {
    name: string;
    columns: {
        type: string;
        name: string;
        dataType: string;
        nullable: boolean;
        isPrimaryKey?: boolean | undefined;
        isForeignKey?: boolean | undefined;
        defaultValue?: unknown;
        maxLength?: number | undefined;
    }[];
    schema?: string | undefined;
    primaryKey?: string[] | undefined;
    foreignKeys?: {
        columns: string[];
        referencedTable: string;
        referencedColumns: string[];
    }[] | undefined;
}>;
export type TableSchema = z.infer<typeof TableSchemaSchema>;
/**
 * Database schema response
 */
export declare const DatabaseSchemaResponseSchema: z.ZodObject<{
    database: z.ZodString;
    tables: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        schema: z.ZodDefault<z.ZodString>;
        columns: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodString;
            dataType: z.ZodString;
            nullable: z.ZodBoolean;
            isPrimaryKey: z.ZodDefault<z.ZodBoolean>;
            isForeignKey: z.ZodDefault<z.ZodBoolean>;
            defaultValue: z.ZodOptional<z.ZodUnknown>;
            maxLength: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            type: string;
            name: string;
            dataType: string;
            nullable: boolean;
            isPrimaryKey: boolean;
            isForeignKey: boolean;
            defaultValue?: unknown;
            maxLength?: number | undefined;
        }, {
            type: string;
            name: string;
            dataType: string;
            nullable: boolean;
            isPrimaryKey?: boolean | undefined;
            isForeignKey?: boolean | undefined;
            defaultValue?: unknown;
            maxLength?: number | undefined;
        }>, "many">;
        primaryKey: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        foreignKeys: z.ZodOptional<z.ZodArray<z.ZodObject<{
            columns: z.ZodArray<z.ZodString, "many">;
            referencedTable: z.ZodString;
            referencedColumns: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            columns: string[];
            referencedTable: string;
            referencedColumns: string[];
        }, {
            columns: string[];
            referencedTable: string;
            referencedColumns: string[];
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        schema: string;
        columns: {
            type: string;
            name: string;
            dataType: string;
            nullable: boolean;
            isPrimaryKey: boolean;
            isForeignKey: boolean;
            defaultValue?: unknown;
            maxLength?: number | undefined;
        }[];
        primaryKey?: string[] | undefined;
        foreignKeys?: {
            columns: string[];
            referencedTable: string;
            referencedColumns: string[];
        }[] | undefined;
    }, {
        name: string;
        columns: {
            type: string;
            name: string;
            dataType: string;
            nullable: boolean;
            isPrimaryKey?: boolean | undefined;
            isForeignKey?: boolean | undefined;
            defaultValue?: unknown;
            maxLength?: number | undefined;
        }[];
        schema?: string | undefined;
        primaryKey?: string[] | undefined;
        foreignKeys?: {
            columns: string[];
            referencedTable: string;
            referencedColumns: string[];
        }[] | undefined;
    }>, "many">;
    totalTables: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    database: string;
    tables: {
        name: string;
        schema: string;
        columns: {
            type: string;
            name: string;
            dataType: string;
            nullable: boolean;
            isPrimaryKey: boolean;
            isForeignKey: boolean;
            defaultValue?: unknown;
            maxLength?: number | undefined;
        }[];
        primaryKey?: string[] | undefined;
        foreignKeys?: {
            columns: string[];
            referencedTable: string;
            referencedColumns: string[];
        }[] | undefined;
    }[];
    totalTables: number;
}, {
    database: string;
    tables: {
        name: string;
        columns: {
            type: string;
            name: string;
            dataType: string;
            nullable: boolean;
            isPrimaryKey?: boolean | undefined;
            isForeignKey?: boolean | undefined;
            defaultValue?: unknown;
            maxLength?: number | undefined;
        }[];
        schema?: string | undefined;
        primaryKey?: string[] | undefined;
        foreignKeys?: {
            columns: string[];
            referencedTable: string;
            referencedColumns: string[];
        }[] | undefined;
    }[];
    totalTables: number;
}>;
export type DatabaseSchemaResponse = z.infer<typeof DatabaseSchemaResponseSchema>;
/**
 * Available database tables
 */
export declare const DatabaseTablesSchema: z.ZodEnum<["Sales", "ChatSession", "ChatMessage"]>;
export type DatabaseTableName = z.infer<typeof DatabaseTablesSchema>;
/**
 * Validate database query request
 */
export declare function validateDatabaseQueryRequest(data: unknown): DatabaseQueryRequest;
/**
 * Safe parse database query request
 */
export declare function safeParseDatabaseQueryRequest(data: unknown): DatabaseQueryRequest | null;
/**
 * Validate SQL query (basic validation)
 * Note: This is a simple validation, not a full SQL parser
 */
export declare function isValidSQL(sql: string): boolean;
