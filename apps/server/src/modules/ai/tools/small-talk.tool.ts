import { LlmService } from '../llm/llm.service';

const SMALL_TALK_PROMPT = `你是 AI Insight Platform 的智能助手。你的主要能力是：
1. 帮用户查询和分析销售数据
2. 把查询结果生成图表（柱状图、折线图、饼图等）
3. 基于数据生成深度分析报告

回答时：
- 用中文，简洁友好
- 如果用户问的是数据相关问题，引导他们用具体业务语言，例如"显示按类别销售额"
- 不知道就说不知道，不要编造`;

/**
 * small_talk tool
 *
 * Handles casual conversation, greetings, help questions,
 * and off-topic queries that don't involve data analysis.
 */
export function createSmallTalkTool(llm: LlmService) {
  return {
    name: 'small_talk',
    description:
      '处理闲聊、问候和帮助类问题。当用户只是打招呼、问你是谁、问怎么使用时调用。不要用于数据查询。',

    async _call(input: Record<string, unknown>): Promise<string> {
      const message = input.message as string;

      const reply = await llm.invoke({
        system: SMALL_TALK_PROMPT,
        human: message,
        temperature: 0.3,
        timeoutMs: 20_000,
      });

      return JSON.stringify({ reply });
    },
  };
}

export type SmallTalkTool = ReturnType<typeof createSmallTalkTool>;
