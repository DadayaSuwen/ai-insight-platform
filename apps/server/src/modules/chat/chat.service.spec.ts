import { Test, TestingModule } from '@nestjs/testing';
import { MessageEvent } from '@nestjs/common';
import { ChatService } from './chat.service';
import { AiService, type AiProcessResult } from '../ai/ai.service';
import type { PlannerStreamEvent } from '../ai/agents/planner.agent';
import { SSEEventType } from '@workspace/types';

describe('ChatService', () => {
  let service: ChatService;
  let aiService: jest.Mocked<AiService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: AiService,
          useValue: { process: jest.fn(), processStream: jest.fn() },
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

  /**
   * Build an async generator from a list of AiStreamEvents.
   */
  async function* mockStream(events: PlannerStreamEvent[]): AsyncGenerator<PlannerStreamEvent, void, unknown> {
    for (const e of events) yield e;
  }

  describe('processMessage (sync)', () => {
    it('should delegate to AiService.process', async () => {
      const result: AiProcessResult = {
        intent: 'chat',
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
      aiService.processStream.mockReturnValue(mockStream([
        { type: 'token', data: { content: '你', isFinal: false } },
        { type: 'token', data: { content: '好', isFinal: false } },
        { type: 'done', data: {} },
      ]))

      const events = await collectEvents(service.processMessageStream('hello'));

      expect(events.map((e) => e.type)).toEqual([
        SSEEventType.TOKEN,
        SSEEventType.TOKEN,
        SSEEventType.DONE,
      ]);
      const tokenData = events[0].data as { content: string; isFinal: boolean };
      expect(tokenData.content).toBe('你');
    });

    it('should emit sql + token + done for sql intent', async () => {
      aiService.processStream.mockReturnValue(mockStream([
        {
          type: 'sql',
          data: { sql: 'SELECT 1', executed: true, rows: [{ '?column?': 1 }] },
        },
        { type: 'token', data: { content: '查询成功', isFinal: false } },
        { type: 'done', data: {} },
      ]));

      const events = await collectEvents(service.processMessageStream('查数据'));

      expect(events.map((e) => e.type)).toEqual([
        SSEEventType.SQL,
        SSEEventType.TOKEN,
        SSEEventType.DONE,
      ]);
      expect((events[0].data as { sql: string }).sql).toBe('SELECT 1');
    });

    it('should emit sql + chart + token + done for chart intent', async () => {
      aiService.processStream.mockReturnValue(mockStream([
        {
          type: 'sql',
          data: { sql: 'SELECT category, SUM(amount) FROM sales', executed: true, rows: [{ category: 'A', total: 100 }] },
        },
        {
          type: 'chart',
          data: {
            chartType: 'bar',
            data: {
              option: { xAxis: { type: 'category', data: ['A'] }, yAxis: { type: 'value' }, series: [{ type: 'bar', data: [100] }] },
              rows: [{ category: 'A', total: 100 }],
            },
          },
        } as unknown as PlannerStreamEvent,
        { type: 'token', data: { content: '图表已生成', isFinal: false } },
        { type: 'done', data: {} },
      ]));

      const events = await collectEvents(service.processMessageStream('柱状图'));

      expect(events.map((e) => e.type)).toEqual([
        SSEEventType.SQL,
        SSEEventType.CHART,
        SSEEventType.TOKEN,
        SSEEventType.DONE,
      ]);
      const chartData = events[1].data as { chartType: string; data: { rows: unknown[] } };
      expect(chartData.chartType).toBe('bar');
      expect(chartData.data.rows).toEqual([{ category: 'A', total: 100 }]);
    });

    it('should emit sql + analysis + done for analysis intent', async () => {
      aiService.processStream.mockReturnValue(mockStream([
        {
          type: 'sql',
          data: { sql: 'SELECT * FROM sales', executed: true, rows: [] },
        },
        { type: 'analysis', data: { content: '趋势: 上升' } },
        { type: 'done', data: {} },
      ]));

      const events = await collectEvents(service.processMessageStream('分析'));

      expect(events.map((e) => e.type)).toEqual([
        SSEEventType.SQL,
        SSEEventType.ANALYSIS,
        SSEEventType.DONE,
      ]);
      expect((events[1].data as { content: string }).content).toBe('趋势: 上升');
    });

    it('should emit error event when stream yields error', async () => {
      aiService.processStream.mockReturnValue(mockStream([
        { type: 'error', data: { code: 'PIPELINE_FAILED', message: 'syntax error' } },
        { type: 'done', data: {} },
      ]));

      const events = await collectEvents(service.processMessageStream('bad'));

      expect(events.map((e) => e.type)).toEqual([
        SSEEventType.ERROR,
        SSEEventType.DONE,
      ]);
      const errorData = events[0].data as { code: string; message: string };
      expect(errorData.code).toBe('PIPELINE_FAILED');
      expect(errorData.message).toBe('syntax error');
    });

    it('should emit error + done when aiService.processStream throws', async () => {
      async function* throwingGen(): AsyncGenerator<PlannerStreamEvent, void, unknown> {
        throw new Error('boom');
      }
      aiService.processStream.mockReturnValue(throwingGen());

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
