/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChatOllama, type ChatOllamaInput } from "@langchain/ollama";
import { AIMessageChunk, type BaseMessage } from "@langchain/core/messages";
import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import { ChatGenerationChunk } from "@langchain/core/outputs";
import { randomUUID } from "crypto";

/**
 * ThinkingChatOllama —— @langchain/ollama@0.2.4 的子类，覆盖 _streamResponseChunks：
 *
 * 0.2.4 原版的两个 bug（对 Qwen3 / DeepSeek-R1 等思考模型致命）：
 *  1. utils.js convertOllamaMessagesToLangChain line 5 把 `messages.thinking` 塞进
 *     `content` 字段，导致 thinking 和正文混在一起，前端展示和 LLM 上下文都被污染。
 *  2. utils.js convertAMessagesToOllama 不读 `additional_kwargs.reasoning_content`，
 *     多轮对话时 Qwen3 API 报 400 "reasoning_content must be passed back"。
 *
 * 本子类直接绕过 0.2.4 的 utils.js，手工构造 AIMessageChunk：
 *  - 入站：thinking → `additional_kwargs.reasoning_content`，content 仅含正文。
 *  - 出站：AIMessage.additional_kwargs.reasoning_content → 请求体 `thinking` 字段。
 *
 * 用法：直接 new ThinkingChatOllama({...}) 替代 new ChatOllama({...})。
 * 其余 API（bindTools / invoke / stream）与 ChatOllama 完全一致。
 */
export class ThinkingChatOllama extends ChatOllama {
  constructor(fields?: ChatOllamaInput) {
    super(fields);
    // 强制开启 Ollama 的 thinking 模式（让流式响应包含 thinking 字段）。
    // Ollama API 0.6+：`think: true` 让 qwen3 / deepseek-r1 输出 reasoning。
    (this as any).think = true;
  }

  /**
   * 覆盖 _streamResponseChunks —— 自己处理 Ollama 原始流，
   * 不依赖 0.2.4 的 utils.js。
   */
  override async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    if (this.checkOrPullModel) {
      if (!(await (this as any).checkModelExistsOnMachine(this.model))) {
        await (this as any).pull(this.model, { logProgress: true });
      }
    }

    const params = (this as any).invocationParams(options);

    // ★ 出站拦截：把 AIMessage.additional_kwargs.reasoning_content
    // 写入 Ollama 请求的 thinking 字段，并转成 Ollama message 格式。
    const ollamaMessages = messagesToOllama(messages);

    const usageMetadata = {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    };

    const stream = await (this as any).client.chat({
      ...params,
      messages: ollamaMessages,
      stream: true,
    });

    let lastMetadata: any;
    for await (const chunk of stream) {
      if (options?.signal?.aborted) {
        (this as any).client.abort();
        return;
      }
      const { message: responseMessage, ...rest } = chunk;
      usageMetadata.input_tokens += rest?.prompt_eval_count ?? 0;
      usageMetadata.output_tokens += rest?.eval_count ?? 0;
      usageMetadata.total_tokens =
        usageMetadata.input_tokens + usageMetadata.output_tokens;
      lastMetadata = rest;

      // ★ 入站拦截：自己构造 AIMessageChunk，把 thinking 写入
      // additional_kwargs.reasoning_content（不污染 content）。
      const thinkingRaw = responseMessage?.thinking;
      const contentRaw = responseMessage?.content;
      const thinking = typeof thinkingRaw === "string" ? thinkingRaw.trim() : "";
      const content = typeof contentRaw === "string" ? contentRaw : "";

      const message = new AIMessageChunk({
        content,
        additional_kwargs: thinking.length > 0
          ? { reasoning_content: thinking }
          : {},
        tool_call_chunks: responseMessage?.tool_calls?.map((tc: any) => ({
          name: tc.function?.name,
          args: JSON.stringify(tc.function?.arguments ?? {}),
          type: "tool_call_chunk" as const,
          index: 0,
          id: randomUUID(),
        })),
        response_metadata: lastMetadata,
        usage_metadata: usageMetadata,
      });

      yield new ChatGenerationChunk({
        text: content,
        message,
      });

      await runManager?.handleLLMNewToken(content);
    }

    // 最终 chunk：response_metadata 收尾
    yield new ChatGenerationChunk({
      text: "",
      message: new AIMessageChunk({
        content: "",
        response_metadata: lastMetadata,
        usage_metadata: usageMetadata,
      }),
    });
  }
}

/**
 * 把 LangChain messages 数组转成 Ollama API 认识的格式。
 *
 * 与 0.2.4 utils.js 的差异：
 *  - AIMessage → { role:"assistant", content, tool_calls?, thinking? }
 *    其中 thinking 来自 additional_kwargs.reasoning_content（Qwen3 API 必须）。
 *  - ToolMessage → { role:"tool", content }
 *  - HumanMessage / SystemMessage → 标准透传。
 */
function messagesToOllama(messages: BaseMessage[]): any[] {
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
        ai.additional_kwargs?.reasoning_content ??
        ai.thinking ??
        null;
      const toolCalls = ai.tool_calls?.length
        ? ai.tool_calls.map((tc: any) => ({
            id: tc.id,
            type: "function",
            function: {
              name: tc.name,
              arguments: tc.args,
            },
          }))
        : undefined;
      const out: any = { role: "assistant", content };
      if (toolCalls) out.tool_calls = toolCalls;
      if (reasoning) out.thinking = reasoning;
      return [out];
    }
    if (type === "tool") {
      const tm: any = msg as any;
      return [
        {
          role: "tool",
          content: typeof tm.content === "string" ? tm.content : JSON.stringify(tm.content),
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
