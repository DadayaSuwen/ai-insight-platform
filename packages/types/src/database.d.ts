import { z } from 'zod';
export declare const QueryRequestSchema: z.ZodObject<{
    sql: z.ZodString;
}, "strip", z.ZodTypeAny, {
    sql: string;
}, {
    sql: string;
}>;
export type QueryRequest = z.infer<typeof QueryRequestSchema>;
export declare const TableSchemaSchema: z.ZodObject<{
    name: z.ZodString;
    columns: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
        nullable: z.ZodBoolean;
        isPrimaryKey: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        type: string;
        name: string;
        nullable: boolean;
        isPrimaryKey: boolean;
    }, {
        type: string;
        name: string;
        nullable: boolean;
        isPrimaryKey: boolean;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    name: string;
    columns: {
        type: string;
        name: string;
        nullable: boolean;
        isPrimaryKey: boolean;
    }[];
}, {
    name: string;
    columns: {
        type: string;
        name: string;
        nullable: boolean;
        isPrimaryKey: boolean;
    }[];
}>;
export type TableSchema = z.infer<typeof TableSchemaSchema>;
export declare const DatabaseSchemaSchema: z.ZodObject<{
    tables: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        columns: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodString;
            nullable: z.ZodBoolean;
            isPrimaryKey: z.ZodBoolean;
        }, "strip", z.ZodTypeAny, {
            type: string;
            name: string;
            nullable: boolean;
            isPrimaryKey: boolean;
        }, {
            type: string;
            name: string;
            nullable: boolean;
            isPrimaryKey: boolean;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        name: string;
        columns: {
            type: string;
            name: string;
            nullable: boolean;
            isPrimaryKey: boolean;
        }[];
    }, {
        name: string;
        columns: {
            type: string;
            name: string;
            nullable: boolean;
            isPrimaryKey: boolean;
        }[];
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    tables: {
        name: string;
        columns: {
            type: string;
            name: string;
            nullable: boolean;
            isPrimaryKey: boolean;
        }[];
    }[];
}, {
    tables: {
        name: string;
        columns: {
            type: string;
            name: string;
            nullable: boolean;
            isPrimaryKey: boolean;
        }[];
    }[];
}>;
export type DatabaseSchema = z.infer<typeof DatabaseSchemaSchema>;
