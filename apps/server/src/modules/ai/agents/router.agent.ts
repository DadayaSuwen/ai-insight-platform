import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import {
  ROUTER_SYSTEM_PROMPT,
  buildRouterUserMessage,
} from '../prompts/router.prompt';
import { LlmService } from '../llm/llm.service';

/**
 * Intent types for routing.
 *
 * NOTE: We keep the public union narrow on purpose — LLM is asked to
 * pick from this exact set, and anything it returns that isn't on the
 * list is coerced back to 'chat' so downstream code never has to
 * handle a surprise intent.
 */
export type IntentType = 'sql' | 'chart' | 'analysis' | 'chat';

const IntentSchema = z.enum(['sql', 'chart', 'analysis', 'chat']);

interface IntentResponse {
  intent: IntentType;
}

/**
 * RouterAgent — Intent Recognition
 *
 * Layered strategy (hybrid to compensate for the 3B model's tendency
 * to over-classify everything as sql/chat):
 *   1. Strong keyword match → use it directly, skip the LLM call.
 *      This keeps latency low and accuracy high for the 80% case.
 *   2. No strong match → ask the LLM.
 *   3. LLM fails / times out / schema mismatch → fall back to the
 *      full keyword classifier so we never break.
 *
 * The fallback isn't just a safety net — it's also what the unit tests
 * exercise by mocking LlmService to throw, so we keep it intact.
 */
@Injectable()
export class RouterAgent {
  private readonly logger = new Logger(RouterAgent.name);

  constructor(private readonly llm: LlmService) {}

  /**
   * Recognize user intent from message.
   */
  async recognize(message: string): Promise<IntentType> {
    this.logger.log(`Recognizing intent for: ${message}`);

    // 1. Strong keyword fast-path. Covers the bulk of real queries
    //    without paying the LLM round-trip cost.
    const fastPath = this.strongKeywordMatch(message);
    if (fastPath) {
      this.logger.log(`Keyword fast-path intent: ${fastPath}`);
      return fastPath;
    }

    // 2. Ask the LLM for ambiguous cases.
    try {
      const result = await this.llm.invokeStructured<z.ZodObject<{
        intent: typeof IntentSchema;
      }>>({
        system: ROUTER_SYSTEM_PROMPT,
        human: buildRouterUserMessage(message),
        schema: z.object({ intent: IntentSchema }),
        timeoutMs: 20_000,
        temperature: 0,
      });
      const validated = (result as IntentResponse).intent;
      this.logger.log(`LLM recognized intent: ${validated}`);
      return validated;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`LLM router failed (${msg}); falling back to keywords`);
      return this.simpleRecognize(message);
    }
  }

  /**
   * Cheap deterministic classifier for messages that contain strong
   * signal for exactly one intent. Returns null when no single intent
   * dominates — caller should ask the LLM in that case.
   *
   * Order: chart > analysis > sql > chat. Chart and analysis keywords
   * tend to be the most specific, so checking them first avoids
   * swallowing them with a generic "sql" match.
   */
  private strongKeywordMatch(message: string): IntentType | null {
    const lower = message.toLowerCase();

    const chartKws = [
      '图表', '图', '可视化', '柱状', '折线', '饼图', '散点', '面积',
      'bar chart', 'line chart', 'pie chart', 'chart', 'graph', 'plot',
    ];
    if (chartKws.some((k) => lower.includes(k))) return 'chart';

    const analysisKws = [
      '分析', '洞察', '为什么', '原因', '预测', '建议', '趋势分析',
      'analyze', 'analysis', 'why', 'insight', 'forecast',
    ];
    if (analysisKws.some((k) => lower.includes(k))) return 'analysis';

    const chatKws = [
      '你好', '您好', 'hello', 'hi', 'hey', '嗨',
      'help', '帮助', '谢谢', 'thank', '你是谁', 'who are you',
      '在吗', '干嘛', '做什么',
    ];
    if (chatKws.some((k) => lower.includes(k))) return 'chat';

    return null;
  }

  /**
   * Keyword-based fallback. Behavior must stay frozen — existing tests
   * assert on its outputs.
   *
   * Priority order: chat (greetings) > chart > analysis > sql > default.
   */
  private simpleRecognize(message: string): IntentType {
    const lowerMessage = message.toLowerCase().trim();

    // Chat keywords - greetings, small talk, help. Match FIRST because they
    // should never be confused with data queries.
    const chatKeywords = [
      '你好', '您好', 'hello', 'hi', 'hey', '嗨',
      'help', '帮助', '谢谢', 'thank', '你是谁', 'who are you',
      '在吗', '干嘛', '做什么',
    ];
    if (chatKeywords.some((kw) => lowerMessage.includes(kw))) {
      return 'chat';
    }

    // Keywords for each intent (chart > analysis > sql priority)
    const chartKeywords = [
      '图表', '图', '可视化', '柱状', '折线', '饼图',
      'bar', 'line', 'pie', '散点', '面积',
    ];
    const analysisKeywords = [
      '分析', '洞察', '为什么', '原因', '预测', '建议',
    ];
    const sqlKeywords = ['查询', '数据', '销售', '多少', 'SELECT', '找出', '统计', '列表', '给我'];

    // Check keywords in priority order
    if (chartKeywords.some((kw) => lowerMessage.includes(kw))) {
      return 'chart';
    }
    if (analysisKeywords.some((kw) => lowerMessage.includes(kw))) {
      return 'analysis';
    }
    if (sqlKeywords.some((kw) => lowerMessage.includes(kw))) {
      return 'sql';
    }

    // Default: short messages (< 6 chars) without data keywords → chat
    // Otherwise assume data query
    if (lowerMessage.length < 6) {
      return 'chat';
    }
    return 'sql';
  }
}