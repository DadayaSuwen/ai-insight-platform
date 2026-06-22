import { z } from 'zod';
/**
 * SSE event types for streaming responses
 */
export declare enum SSEEventType {
    TOKEN = "token",
    SQL = "sql",
    CHART = "chart",
    ANALYSIS = "analysis",
    ERROR = "error",
    DONE = "done"
}
/**
 * Chat message role
 */
export declare const ChatRoleSchema: z.ZodEnum<["user", "assistant", "system"]>;
/**
 * Chat message schema
 */
export declare const ChatMessageSchema: z.ZodObject<{
    id: z.ZodString;
    role: z.ZodEnum<["user", "assistant", "system"]>;
    content: z.ZodString;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    createdAt: string;
}, {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    createdAt: string;
}>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
/**
 * Message type alias for frontend store
 */
export type Message = ChatMessage;
/**
 * Chat message request
 */
export declare const ChatMessageRequestSchema: z.ZodObject<{
    message: z.ZodString;
    sessionId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    message: string;
    sessionId?: string | undefined;
}, {
    message: string;
    sessionId?: string | undefined;
}>;
export type ChatMessageRequest = z.infer<typeof ChatMessageRequestSchema>;
/**
 * Create new chat session request
 */
export declare const CreateSessionRequestSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    userId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    title?: string | undefined;
    userId?: string | undefined;
}, {
    title?: string | undefined;
    userId?: string | undefined;
}>;
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;
/**
 * Chat message response
 */
export declare const ChatMessageResponseSchema: z.ZodObject<{
    sessionId: z.ZodString;
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message: string;
    sessionId: string;
}, {
    message: string;
    sessionId: string;
}>;
export type ChatMessageResponse = z.infer<typeof ChatMessageResponseSchema>;
/**
 * Chat session schema
 */
export declare const ChatSessionSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodNullable<z.ZodString>;
    userId: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    title: string | null;
    userId: string | null;
    updatedAt: string;
}, {
    id: string;
    createdAt: string;
    title: string | null;
    userId: string | null;
    updatedAt: string;
}>;
export type ChatSession = z.infer<typeof ChatSessionSchema>;
/**
 * Chat history response
 */
export declare const ChatHistoryResponseSchema: z.ZodObject<{
    session: z.ZodObject<{
        id: z.ZodString;
        title: z.ZodNullable<z.ZodString>;
        userId: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        createdAt: string;
        title: string | null;
        userId: string | null;
        updatedAt: string;
    }, {
        id: string;
        createdAt: string;
        title: string | null;
        userId: string | null;
        updatedAt: string;
    }>;
    messages: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        role: z.ZodEnum<["user", "assistant", "system"]>;
        content: z.ZodString;
        createdAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        role: "user" | "assistant" | "system";
        content: string;
        createdAt: string;
    }, {
        id: string;
        role: "user" | "assistant" | "system";
        content: string;
        createdAt: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    session: {
        id: string;
        createdAt: string;
        title: string | null;
        userId: string | null;
        updatedAt: string;
    };
    messages: {
        id: string;
        role: "user" | "assistant" | "system";
        content: string;
        createdAt: string;
    }[];
}, {
    session: {
        id: string;
        createdAt: string;
        title: string | null;
        userId: string | null;
        updatedAt: string;
    };
    messages: {
        id: string;
        role: "user" | "assistant" | "system";
        content: string;
        createdAt: string;
    }[];
}>;
export type ChatHistoryResponse = z.infer<typeof ChatHistoryResponseSchema>;
/**
 * SSE message schema for streaming
 */
export declare const SSEMessageSchema: z.ZodObject<{
    event: z.ZodNativeEnum<typeof SSEEventType>;
    data: z.ZodString;
}, "strip", z.ZodTypeAny, {
    event: SSEEventType;
    data: string;
}, {
    event: SSEEventType;
    data: string;
}>;
export type SSEMessage = z.infer<typeof SSEMessageSchema>;
/**
 * SSE token event data
 */
export declare const SSETokenDataSchema: z.ZodObject<{
    content: z.ZodString;
    isFinal: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    content: string;
    isFinal: boolean;
}, {
    content: string;
    isFinal?: boolean | undefined;
}>;
export type SSETokenData = z.infer<typeof SSETokenDataSchema>;
/**
 * SSE SQL event data
 */
export declare const SSESQLDataSchema: z.ZodObject<{
    sql: z.ZodString;
    executed: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    sql: string;
    executed: boolean;
}, {
    sql: string;
    executed?: boolean | undefined;
}>;
export type SSESQLData = z.infer<typeof SSESQLDataSchema>;
/**
 * SSE chart event data
 */
export declare const SSEChartDataSchema: z.ZodObject<{
    chartType: z.ZodEnum<["line", "bar", "pie", "scatter", "area"]>;
    title: z.ZodOptional<z.ZodString>;
    xAxis: z.ZodOptional<z.ZodString>;
    yAxis: z.ZodOptional<z.ZodString>;
    data: z.ZodRecord<z.ZodString, z.ZodAny>;
}, "strip", z.ZodTypeAny, {
    data: Record<string, any>;
    chartType: "line" | "bar" | "pie" | "scatter" | "area";
    title?: string | undefined;
    xAxis?: string | undefined;
    yAxis?: string | undefined;
}, {
    data: Record<string, any>;
    chartType: "line" | "bar" | "pie" | "scatter" | "area";
    title?: string | undefined;
    xAxis?: string | undefined;
    yAxis?: string | undefined;
}>;
export type SSEChartData = z.infer<typeof SSEChartDataSchema>;
/**
 * SSE analysis event data
 */
export declare const SSEAnalysisDataSchema: z.ZodObject<{
    content: z.ZodString;
    keyInsights: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    content: string;
    keyInsights?: string[] | undefined;
}, {
    content: string;
    keyInsights?: string[] | undefined;
}>;
export type SSEAnalysisData = z.infer<typeof SSEAnalysisDataSchema>;
/**
 * SSE error event data
 */
export declare const SSEErrorDataSchema: z.ZodObject<{
    code: z.ZodOptional<z.ZodString>;
    message: z.ZodString;
    details: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    message: string;
    code?: string | undefined;
    details?: string | undefined;
}, {
    message: string;
    code?: string | undefined;
    details?: string | undefined;
}>;
export type SSEErrorData = z.infer<typeof SSEErrorDataSchema>;
/**
 * Generic API success response
 */
export declare const ApiSuccessResponseSchema: z.ZodObject<{
    success: z.ZodLiteral<true>;
    data: z.ZodUnknown;
}, "strip", z.ZodTypeAny, {
    success: true;
    data?: unknown;
}, {
    success: true;
    data?: unknown;
}>;
export type ApiSuccessResponse = z.infer<typeof ApiSuccessResponseSchema>;
/**
 * Generic API error response
 */
export declare const ApiErrorResponseSchema: z.ZodObject<{
    success: z.ZodLiteral<false>;
    error: z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
        details: z.ZodOptional<z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        code: string;
        message: string;
        details?: unknown;
    }, {
        code: string;
        message: string;
        details?: unknown;
    }>;
}, "strip", z.ZodTypeAny, {
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
    success: false;
}, {
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
    success: false;
}>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
/**
 * Generic API response
 */
export declare const ApiResponseSchema: z.ZodUnion<[z.ZodObject<{
    success: z.ZodLiteral<true>;
    data: z.ZodUnknown;
}, "strip", z.ZodTypeAny, {
    success: true;
    data?: unknown;
}, {
    success: true;
    data?: unknown;
}>, z.ZodObject<{
    success: z.ZodLiteral<false>;
    error: z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
        details: z.ZodOptional<z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        code: string;
        message: string;
        details?: unknown;
    }, {
        code: string;
        message: string;
        details?: unknown;
    }>;
}, "strip", z.ZodTypeAny, {
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
    success: false;
}, {
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
    success: false;
}>]>;
export type ApiResponse = z.infer<typeof ApiResponseSchema>;
/**
 * Validate chat message request
 */
export declare function validateChatMessageRequest(data: unknown): ChatMessageRequest;
/**
 * Validate and sanitize chat message request (strips unknown fields)
 */
export declare function safeParseChatMessageRequest(data: unknown): ChatMessageRequest | null;
