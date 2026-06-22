import { z } from 'zod';
// ============================================
// SSE Event Types
// ============================================
/**
 * SSE event types for streaming responses
 */
export var SSEEventType;
(function (SSEEventType) {
    SSEEventType["TOKEN"] = "token";
    SSEEventType["SQL"] = "sql";
    SSEEventType["CHART"] = "chart";
    SSEEventType["ANALYSIS"] = "analysis";
    SSEEventType["ERROR"] = "error";
    SSEEventType["DONE"] = "done";
})(SSEEventType || (SSEEventType = {}));
// ============================================
// Chat Message Schemas
// ============================================
/**
 * Chat message role
 */
export const ChatRoleSchema = z.enum(['user', 'assistant', 'system']);
/**
 * Chat message schema
 */
export const ChatMessageSchema = z.object({
    id: z.string().uuid(),
    role: ChatRoleSchema,
    content: z.string(),
    createdAt: z.string().datetime(),
});
// ============================================
// Chat Request Schemas
// ============================================
/**
 * Chat message request
 */
export const ChatMessageRequestSchema = z.object({
    message: z.string().min(1, { message: '消息内容不能为空' }),
    sessionId: z.string().uuid().optional(),
});
/**
 * Create new chat session request
 */
export const CreateSessionRequestSchema = z.object({
    title: z.string().optional(),
    userId: z.string().optional(),
});
// ============================================
// Chat Response Schemas
// ============================================
/**
 * Chat message response
 */
export const ChatMessageResponseSchema = z.object({
    sessionId: z.string().uuid(),
    message: z.string(),
});
/**
 * Chat session schema
 */
export const ChatSessionSchema = z.object({
    id: z.string().uuid(),
    title: z.string().nullable(),
    userId: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
});
/**
 * Chat history response
 */
export const ChatHistoryResponseSchema = z.object({
    session: ChatSessionSchema,
    messages: z.array(ChatMessageSchema),
});
// ============================================
// SSE Message Schemas
// ============================================
/**
 * SSE message schema for streaming
 */
export const SSEMessageSchema = z.object({
    event: z.nativeEnum(SSEEventType),
    data: z.string(),
});
/**
 * SSE token event data
 */
export const SSETokenDataSchema = z.object({
    content: z.string(),
    isFinal: z.boolean().default(false),
});
/**
 * SSE SQL event data
 */
export const SSESQLDataSchema = z.object({
    sql: z.string(),
    executed: z.boolean().default(false),
});
/**
 * SSE chart event data
 */
export const SSEChartDataSchema = z.object({
    chartType: z.enum(['line', 'bar', 'pie', 'scatter', 'area']),
    title: z.string().optional(),
    xAxis: z.string().optional(),
    yAxis: z.string().optional(),
    data: z.record(z.string(), z.any()),
});
/**
 * SSE analysis event data
 */
export const SSEAnalysisDataSchema = z.object({
    content: z.string(),
    keyInsights: z.array(z.string()).optional(),
});
/**
 * SSE error event data
 */
export const SSEErrorDataSchema = z.object({
    code: z.string().optional(),
    message: z.string(),
    details: z.string().optional(),
});
// ============================================
// API Response Schemas
// ============================================
/**
 * Generic API success response
 */
export const ApiSuccessResponseSchema = z.object({
    success: z.literal(true),
    data: z.unknown(),
});
/**
 * Generic API error response
 */
export const ApiErrorResponseSchema = z.object({
    success: z.literal(false),
    error: z.object({
        code: z.string(),
        message: z.string(),
        details: z.unknown().optional(),
    }),
});
/**
 * Generic API response
 */
export const ApiResponseSchema = z.union([
    ApiSuccessResponseSchema,
    ApiErrorResponseSchema,
]);
// ============================================
// Validation Helper Functions
// ============================================
/**
 * Validate chat message request
 */
export function validateChatMessageRequest(data) {
    return ChatMessageRequestSchema.parse(data);
}
/**
 * Validate and sanitize chat message request (strips unknown fields)
 */
export function safeParseChatMessageRequest(data) {
    return ChatMessageRequestSchema.safeParse(data).success
        ? ChatMessageRequestSchema.parse(data)
        : null;
}
