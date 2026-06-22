import { Test, TestingModule } from '@nestjs/testing';
import { MessageEvent } from '@nestjs/common';
import { ChatService } from './chat.service';
import { AiService, AiProcessResult } from '../ai/ai.service';
import { SSEEventType } from '@workspace/types';
import { IntentType } from '../ai/agents/router.agent';

describe('ChatService', () => {
  let service: ChatService;
  let aiService: jest.Mocked<AiService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: AiService,
          useValue: { process: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
    aiService = module.get(AiService);
  });

  /**
   * Collect all MessageEvents from an Observable into an array.
   */
  async function collectEvents(
    source: ReturnType<ChatService['processMessageStream']>,
  ): Promise<MessageEvent[]> {
    const events: MessageEvent[] = [];
    await new Promise<void>((resolve, reject) => {
      source.subscribe({
        next: (e) => events.push(e),
        error: reject,
        complete: () => resolve(),
      });
    });
    return events;
  }

  describe('processMessage (sync)', () => {
    it('should delegate to AiService.process', async () => {
      const result: AiProcessResult = {
        intent: 'chat' as IntentType,
        message: 'hi',
      };
      aiService.process.mockResolvedValue(result);

      const out = await service.processMessage('hello');

      expect(out).toBe(result);
      expect(aiService.process).toHaveBeenCalledWith('hello');
    });
  });

  describe('processMessageStream (SSE)', () => {
    it('should emit token + done for chat intent', async () => {
      aiService.process.mockResolvedValue({
        intent: 'chat' as IntentType,
        message: '你好',
      });

      const events = await collectEvents(service.processMessageStream('hello'));

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe(SSEEventType.TOKEN);
      expect(events[0].data).toEqual({ content: '你好', isFinal: false });
      expect(events[1].type).toBe(SSEEventType.DONE);
    });

    it('should emit token + sql + done for sql intent', async () => {
      aiService.process.mockResolvedValue({
        intent: 'sql' as IntentType,
        message: '查询成功',
        sql: 'SELECT 1',
        executed: true,
        rows: [{ '?column?': 1 }],
      });

      const events = await collectEvents(service.processMessageStream('查数据'));

      expect(events.map((e) => e.type)).toEqual([
        SSEEventType.TOKEN,
        SSEEventType.SQL,
        SSEEventType.DONE,
      ]);
      expect((events[1].data as { sql: string }).sql).toBe('SELECT 1');
    });

    it('should emit token + sql + chart + done for chart intent', async () => {
      aiService.process.mockResolvedValue({
        intent: 'chart' as IntentType,
        message: '已生成图表',
        sql: 'SELECT category, SUM(amount) FROM sales',
        executed: true,
        rows: [{ category: 'A', total: 100 }],
        chart: {
          xAxis: { type: 'category', data: ['A'] },
          yAxis: { type: 'value' },
          series: [{ type: 'bar', data: [100] }],
        },
      });

      const events = await collectEvents(service.processMessageStream('柱状图'));

      expect(events.map((e) => e.type)).toEqual([
        SSEEventType.TOKEN,
        SSEEventType.SQL,
        SSEEventType.CHART,
        SSEEventType.DONE,
      ]);
      const chartData = events[2].data as { chartType: string; data: { rows: unknown[] } };
      expect(chartData.chartType).toBe('bar');
      expect(chartData.data.rows).toEqual([{ category: 'A', total: 100 }]);
    });

    it('should emit token + sql + analysis + done for analysis intent', async () => {
      aiService.process.mockResolvedValue({
        intent: 'analysis' as IntentType,
        message: '分析完成',
        sql: 'SELECT * FROM sales',
        executed: true,
        rows: [],
        analysis: '趋势: 上升',
      });

      const events = await collectEvents(service.processMessageStream('分析'));

      expect(events.map((e) => e.type)).toEqual([
        SSEEventType.TOKEN,
        SSEEventType.SQL,
        SSEEventType.ANALYSIS,
        SSEEventType.DONE,
      ]);
      expect((events[2].data as { content: string }).content).toBe('趋势: 上升');
    });

    it('should emit error event when result.error is present', async () => {
      aiService.process.mockResolvedValue({
        intent: 'sql' as IntentType,
        message: '出错',
        error: { code: 'PIPELINE_FAILED', message: 'syntax error' },
      });

      const events = await collectEvents(service.processMessageStream('bad'));

      expect(events.map((e) => e.type)).toEqual([
        SSEEventType.TOKEN,
        SSEEventType.ERROR,
        SSEEventType.DONE,
      ]);
      const errorData = events[1].data as { code: string; message: string };
      expect(errorData.code).toBe('PIPELINE_FAILED');
      expect(errorData.message).toBe('syntax error');
    });

    it('should emit error + done when aiService throws', async () => {
      aiService.process.mockRejectedValue(new Error('boom'));

      const events = await collectEvents(service.processMessageStream('x'));

      expect(events.map((e) => e.type)).toEqual([
        SSEEventType.ERROR,
        SSEEventType.DONE,
      ]);
      const errorData = events[0].data as { code: string; message: string };
      expect(errorData.code).toBe('STREAM_FAILED');
      expect(errorData.message).toBe('boom');
    });
  });
});
