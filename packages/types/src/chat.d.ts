import { z } from 'zod';
export declare enum SSEEventType {
    TOKEN = "token",
    SQL = "sql",
    CHART = "chart",
    ANALYSIS = "analysis",
    ERROR = "error",
    DONE = "done"
}
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
export type Message = ChatMessage;
export declare const ChatRequestSchema: z.ZodObject<{
    message: z.ZodString;
    sessionId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    message: string;
    sessionId?: string | undefined;
}, {
    message: string;
    sessionId?: string | undefined;
}>;
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export declare const ChatResponseSchema: z.ZodObject<{
    sessionId: z.ZodString;
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message: string;
    sessionId: string;
}, {
    message: string;
    sessionId: string;
}>;
export type ChatResponse = z.infer<typeof ChatResponseSchema>;
