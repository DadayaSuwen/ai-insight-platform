import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from './ai.service';
import { PlannerAgent, type PlannerStreamEvent } from './agents/planner.agent';
import { SqlAgent } from './agents/sql.agent';
import { ChartAgent, type EChartsOption } from './agents/chart.agent';
import { AnalysisAgent } from './agents/analysis.agent';
import { DatabaseService } from '../database/database.service';
import { LlmService } from './llm/llm.service';
import { createLlmMock } from './llm/llm.mock';

describe('AiService', () => {
  let service: AiService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let plannerAgent: any;

  const mockRows = [
    { category: 'A', total: 100 },
    { category: 'B', total: 200 },
  ];

  const mockChart: EChartsOption = {
    xAxis: { type: 'category', data: ['A', 'B'] },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data: [100, 200] }],
  };

  function toStream(events: PlannerStreamEvent[]) {
    async function* gen(): AsyncGenerator<PlannerStreamEvent> {
      for (const e of events) yield e;
    }
    return gen();
  }

  beforeEach(async () => {
    plannerAgent = {
      refreshSchema: jest.fn().mockResolvedValue(undefined),
      invokeStream: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        // Override PlannerAgent so NestJS doesn't try to instantiate the real class
        // (which would call real LLM/DatabaseService at construction time)
        { provide: PlannerAgent, useValue: plannerAgent },
        {
          provide: SqlAgent,
          useValue: { generate: jest.fn(), summarize: jest.fn() },
        },
        {
          provide: ChartAgent,
          useValue: { generate: jest.fn() },
        },
        {
          provide: AnalysisAgent,
          useValue: { generate: jest.fn() },
        },
        {
          provide: DatabaseService,
          useValue: { executeQuery: jest.fn(), getSchema: jest.fn().mockResolvedValue([]) },
        },
        { provide: LlmService, useValue: createLlmMock() },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  describe('process (sync)', () => {
    it('should return chat result for small talk', async () => {
      plannerAgent.invokeStream.mockReturnValue(
        toStream([
          { type: 'tool_call', data: { name: 'small_talk', args: { message: '你好' } } } as PlannerStreamEvent,
          { type: 'tool_result', data: { name: 'small_talk', result: { reply: '你好！有什么可以帮你？' } } } as PlannerStreamEvent,
          { type: 'token', data: { content: '你好！有什么可以帮你？', isFinal: false } } as PlannerStreamEvent,
          { type: 'done', data: {} } as PlannerStreamEvent,
        ]),
      );

      const result = await service.process('你好');

      expect(result.intent).toBe('chat');
      expect(result.message).toBe('你好！有什么可以帮你？');
    });

    it('should return sql result with rows', async () => {
      plannerAgent.invokeStream.mockReturnValue(
        toStream([
          { type: 'tool_call', data: { name: 'query_sales', args: { query: '查询所有数据' } } } as PlannerStreamEvent,
          { type: 'tool_result', data: { name: 'query_sales', result: { sql: 'SELECT 1', rows: mockRows, rowCount: 2 } } } as PlannerStreamEvent,
          { type: 'sql', data: { sql: 'SELECT 1', executed: true, rows: mockRows } } as PlannerStreamEvent,
          { type: 'token', data: { content: '查询返回 2 条数据', isFinal: false } } as PlannerStreamEvent,
          { type: 'done', data: {} } as PlannerStreamEvent,
        ]),
      );

      const result = await service.process('查询所有数据');

      expect(result.intent).toBe('sql');
      expect(result.sql).toBe('SELECT 1');
      expect(result.rows).toEqual(mockRows);
      expect(result.message).toBe('查询返回 2 条数据');
    });

    it('should return chart result', async () => {
      plannerAgent.invokeStream.mockReturnValue(
        toStream([
          { type: 'tool_call', data: { name: 'gen_chart', args: { query: '按类别显示柱状图' } } } as PlannerStreamEvent,
          { type: 'tool_result', data: { name: 'gen_chart', result: { sql: 'SELECT category', rows: mockRows, chart: mockChart, chartType: 'bar', rowCount: 2 } } } as PlannerStreamEvent,
          { type: 'sql', data: { sql: 'SELECT category', executed: true, rows: mockRows } } as PlannerStreamEvent,
          { type: 'chart', data: { chartType: 'bar', data: { option: mockChart, rows: mockRows } } } as PlannerStreamEvent,
          { type: 'done', data: {} } as PlannerStreamEvent,
        ]),
      );

      const result = await service.process('按类别显示柱状图');

      expect(result.intent).toBe('chart');
      expect(result.chart).toEqual(mockChart);
    });

    it('should return analysis result', async () => {
      plannerAgent.invokeStream.mockReturnValue(
        toStream([
          { type: 'tool_call', data: { name: 'gen_analysis', args: { query: '分析销售趋势' } } } as PlannerStreamEvent,
          { type: 'tool_result', data: { name: 'gen_analysis', result: { sql: 'SELECT *', rows: mockRows, analysis: '趋势分析：类别 B 表现最佳', rowCount: 2 } } } as PlannerStreamEvent,
          { type: 'sql', data: { sql: 'SELECT *', executed: true, rows: mockRows } } as PlannerStreamEvent,
          { type: 'analysis', data: { content: '趋势分析：类别 B 表现最佳' } } as PlannerStreamEvent,
          { type: 'done', data: {} } as PlannerStreamEvent,
        ]),
      );

      const result = await service.process('分析销售趋势');

      expect(result.intent).toBe('analysis');
      expect(result.analysis).toBe('趋势分析：类别 B 表现最佳');
    });

    it('should return error result when PlannerAgent throws', async () => {
      async function* throwingGen(): AsyncGenerator<PlannerStreamEvent> {
        throw new Error('LLM unavailable');
      }
      plannerAgent.invokeStream.mockReturnValue(throwingGen());

      const result = await service.process('查询');

      expect(result.error?.code).toBe('PLANNER_FAILED');
      expect(result.error?.message).toBe('LLM unavailable');
    });
  });

  describe('processStream (SSE)', () => {
    it('should delegate to PlannerAgent.invokeStream', async () => {
      const events: PlannerStreamEvent[] = [
        { type: 'token', data: { content: 'hi', isFinal: false } } as PlannerStreamEvent,
        { type: 'done', data: {} } as PlannerStreamEvent,
      ];
      plannerAgent.invokeStream.mockReturnValue(toStream(events));

      const collected: PlannerStreamEvent[] = [];
      for await (const e of service.processStream('hello')) {
        collected.push(e);
      }

      expect(collected).toEqual(events);
      expect(plannerAgent.refreshSchema).toHaveBeenCalled();
      expect(plannerAgent.invokeStream).toHaveBeenCalledWith('hello');
    });

    it('should yield error and done on PlannerAgent failure', async () => {
      async function* throwingGen(): AsyncGenerator<PlannerStreamEvent> {
        throw new Error('connection lost');
      }
      plannerAgent.invokeStream.mockReturnValue(throwingGen());

      const collected: PlannerStreamEvent[] = [];
      for await (const e of service.processStream('hello')) {
        collected.push(e);
      }

      expect(collected).toHaveLength(2);
      expect(collected[0]).toEqual({ type: 'error', data: { code: 'PLANNER_FAILED', message: 'connection lost' } });
      expect(collected[1]).toEqual({ type: 'done', data: {} });
    });
  });
});
