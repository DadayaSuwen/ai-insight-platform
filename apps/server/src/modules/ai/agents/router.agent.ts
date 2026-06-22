import { Injectable, Logger } from '@nestjs/common';
import {
  ROUTER_SYSTEM_PROMPT,
  buildRouterUserMessage,
} from '../prompts/router.prompt';

/**
 * Intent types for routing
 */
export type IntentType = 'sql' | 'chart' | 'analysis' | 'chat';

/**
 * RouterAgent - Intent Recognition
 * 识别用户意图，决定调用哪个 Agent
 */
@Injectable()
export class RouterAgent {
  private readonly logger = new Logger(RouterAgent.name);

  /**
   * Recognize user intent from message
   */
  async recognize(message: string): Promise<IntentType> {
    this.logger.log(`Recognizing intent for: ${message}`);

    try {
      // TODO: Integrate with LangChain + Ollama
      // For now, use simple keyword-based detection

      const intent = this.simpleRecognize(message);
      this.logger.log(`Recognized intent: ${intent}`);

      return intent;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Intent recognition failed: ${message}`);
      return 'chat'; // Default to chat on error
    }
  }

  /**
   * Simple keyword-based intent recognition
   * TODO: Replace with LLM-based recognition
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