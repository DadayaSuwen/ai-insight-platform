/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChatOpenAI, type ChatOpenAIFields } from "@langchain/openai";
import { AIMessageChunk, type BaseMessage } from "@langchain/core/messages";
import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import { ChatGenerationChunk } from "@langchain/core/outputs";

/**
 * ThinkingChatOpenAI —— @langchain/openai@0.3.11 子类，覆盖 _streamResponseChunks：
 *
 * 解决的问题：
 *  - DeepSeek API（OpenAI 兼容协议）以及 o1 / o3 等 OpenAI 思考模型需要
 *    reasoning_content 多轮透传（与 Qwen3 Ollama 同源问题）。
 *  - @langchain/openai@0.3.11 的 _convertMessagesToOpenAIParams 不读
 *    additional_kwargs.reasoning_content，多轮对话报 400。
 *
 * 本子类：
 *  - 入站：DeepSeek / o1 流式响应里 delta.reasoning_content（如果有）写入
 *    AIMessageChunk.additional_kwargs.reasoning_content。
 *  - 出站：AIMessage.additional_kwargs.reasoning_content → OpenAI 请求体
 *    assistant 消息的 reasoning_content 字段（DeepSeek 协议）。
 */
export interface ThinkingChatOpenAIFields extends ChatOpenAIFields {
  /**
   * 是否启用 thinking 模式。
   *  - true → 出站 messages 注入 reasoning_content；入站响应若有
   *           delta.reasoning_content 会写入 additional_kwargs。
   *  - false（默认）→ 与原版 ChatOpenAI 完全一致。
   */
  thinking?: boolean;
}

export class ThinkingChatOpenAI extends ChatOpenAI {
  private readonly enableThinking: boolean;

  constructor(fields?: ThinkingChatOpenAIFields) {
    super(fields);
    this.enableThinking = fields?.thinking ?? false;
  }

  isThinkingEnabled(): boolean {
    return this.enableThinking;
  }

  /**
   * 覆盖 _streamResponseChunks —— 不走 0.3.11 原版的 _convertMessagesToOpenAIParams，
   * 自己构造 OpenAI 协议消息体（注入 reasoning_content）。
   */
  override async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    if (this.enableThinking) {
      // 思考模式：手工构造请求体，注入 reasoning_content 字段
      yield* this._streamThinkingChunks(messages, options, runManager);
      return;
    }
    // 非思考模式：走原版 ChatOpenAI（不破坏现有 OpenAI 调用路径）
    yield* super._streamResponseChunks(messages, options, runManager);
  }

  private async *_streamThinkingChunks(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    const params = (this as any).invocationParams(options);
    // 出站：把 AIMessage.additional_kwargs.reasoning_content 写入消息体
    const openaiMessages = messagesToOpenAI(messages);

    // DeepSeek / OpenAI 兼容端点通常用 Chat Completions API
    // 直接调 createChatCompletion 流式接口
    const stream = await (this as any).client.chat.completions.create({
      ...params,
      messages: openaiMessages,
      stream: true,
    });

    let lastMetadata: any;
    for await (const chunk of stream) {
      if (options?.signal?.aborted) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this as any).client?.abort?.();
        return;
      }
      lastMetadata = chunk;

      const choice = chunk.choices?.[0];
      const delta = choice?.delta ?? {};
      const contentChunk: string =
        typeof delta.content === "string" ? delta.content : "";
      const reasoningChunk: string =
        typeof delta.reasoning_content === "string"
          ? delta.reasoning_content
          : "";

      const toolCallChunks = delta.tool_calls?.map((tc: any, idx: number) => ({
        name: tc.function?.name,
        args: typeof tc.function?.arguments === "string" ? tc.function.arguments : "",
        id: tc.id,
        index: tc.index ?? idx,
        type: "tool_call_chunk" as const,
      }));

      const message = new AIMessageChunk({
        content: contentChunk,
        additional_kwargs:
          reasoningChunk.length > 0
            ? { reasoning_content: reasoningChunk }
            : {},
        tool_call_chunks: toolCallChunks,
        response_metadata: {
          ...(chunk as any),
          model_provider: "openai",
        },
      });

      yield new ChatGenerationChunk({
        text: contentChunk,
        message,
      });

      await runManager?.handleLLMNewToken(contentChunk);
    }

    // 收尾
    yield new ChatGenerationChunk({
      text: "",
      message: new AIMessageChunk({
        content: "",
        response_metadata: {
          ...(lastMetadata ?? {}),
          model_provider: "openai",
        },
      }),
    });
  }
}

/**
 * 把 LangChain messages 转成 OpenAI Chat Completions 协议格式。
 * 与 0.3.11 utils.js _convertMessagesToOpenAIParams 的差异：
 *  - AIMessage 会同时写入 content + reasoning_content（来自 additional_kwargs）
 *    reasoning_content 是 DeepSeek API 多轮透传必需字段。
 *  - 保留 tool_calls、name 等所有原版字段。
 */
function messagesToOpenAI(messages: BaseMessage[]): any[] {
  return messages.flatMap((msg) => {
    const type = msg._getType();
    if (type === "system") {
      return [{ role: "system", content: stringContent(msg.content) }];
    }
    if (type === "human" || type === "generic") {
      return [{ role: "user", content: stringContent(msg.content) }];
    }
    if (type === "ai") {
      const ai: any = msg as any;
      const content = stringContent(ai.content);
      const reasoning =
        ai.additional_kwargs?.reasoning_content ?? ai.thinking ?? null;
      const toolCalls = ai.tool_calls?.length
        ? ai.tool_calls.map((tc: any) => ({
            id: tc.id,
            type: "function",
            function: {
              name: tc.name,
              arguments:
                typeof tc.args === "string" ? tc.args : JSON.stringify(tc.args ?? {}),
            },
          }))
        : undefined;
      const out: any = { role: "assistant", content };
      if (toolCalls) out.tool_calls = toolCalls;
      if (reasoning) out.reasoning_content = reasoning;
      return [out];
    }
    if (type === "tool") {
      const tm: any = msg as any;
      return [
        {
          role: "tool",
          content: typeof tm.content === "string" ? tm.content : JSON.stringify(tm.content),
          tool_call_id: tm.tool_call_id,
        },
      ];
    }
    throw new Error(`Unsupported message type: ${type}`);
  });
}

function stringContent(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c: any) => {
        if (typeof c === "string") return c;
        if (c && typeof c === "object" && typeof c.text === "string") return c.text;
        return "";
      })
      .join("");
  }
  return "";
}
