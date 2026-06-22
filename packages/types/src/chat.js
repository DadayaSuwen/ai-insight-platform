import { z } from 'zod';
// SSE Event Types
export var SSEEventType;
(function (SSEEventType) {
    SSEEventType["TOKEN"] = "token";
    SSEEventType["SQL"] = "sql";
    SSEEventType["CHART"] = "chart";
    SSEEventType["ANALYSIS"] = "analysis";
    SSEEventType["ERROR"] = "error";
    SSEEventType["DONE"] = "done";
})(SSEEventType || (SSEEventType = {}));
// SSE Message Schema
export const SSEMessageSchema = z.object({
    event: z.nativeEnum(SSEEventType),
    data: z.string(),
});
// Chat Message Schema
export const ChatMessageSchema = z.object({
    id: z.string(),
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
    createdAt: z.string().datetime(),
});
// Chat Request Schema
export const ChatRequestSchema = z.object({
    message: z.string().min(1),
    sessionId: z.string().optional(),
});
// Chat Response Schema
export const ChatResponseSchema = z.object({
    sessionId: z.string(),
    message: z.string(),
});
