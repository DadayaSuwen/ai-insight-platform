import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from './ai.service';
import { RouterAgent, IntentType } from './agents/router.agent';
import { SqlAgent } from './agents/sql.agent';
import { ChartAgent, EChartsOption } from './agents/chart.agent';
import { AnalysisAgent } from './agents/analysis.agent';
import { DatabaseService } from '../database/database.service';

describe('AiService', () => {
  let service: AiService;
  let routerAgent: jest.Mocked<RouterAgent>;
  let sqlAgent: jest.Mocked<SqlAgent>;
  let chartAgent: jest.Mocked<ChartAgent>;
  let analysisAgent: jest.Mocked<AnalysisAgent>;
  let databaseService: jest.Mocked<DatabaseService>;

  const mockRows = [
    { category: 'A', total: 100 },
    { category: 'B', total: 200 },
  ];

  const mockChart: EChartsOption = {
    xAxis: { type: 'category', data: ['A', 'B'] },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data: [100, 200] }],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        {
          provide: RouterAgent,
          useValue: { recognize: jest.fn() },
        },
        {
          provide: SqlAgent,
          useValue: { generate: jest.fn() },
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
          useValue: { executeQuery: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
    routerAgent = module.get(RouterAgent);
    sqlAgent = module.get(SqlAgent);
    chartAgent = module.get(ChartAgent);
    analysisAgent = module.get(AnalysisAgent);
    databaseService = module.get(DatabaseService);
  });

  describe('chat intent', () => {
    it('should return chat result without invoking SQL pipeline', async () => {
      routerAgent.recognize.mockResolvedValue('chat');

      const result = await service.process('你好');

      expect(result.intent).toBe('chat');
      expect(result.message).toContain('你好');
      expect(result.sql).toBeUndefined();
      expect(result.rows).toBeUndefined();
      expect(sqlAgent.generate).not.toHaveBeenCalled();
      expect(databaseService.executeQuery).not.toHaveBeenCalled();
    });
  });

  describe('sql intent', () => {
    it('should run sql pipeline and return rows', async () => {
      routerAgent.recognize.mockResolvedValue('sql');
      sqlAgent.generate.mockResolvedValue('SELECT 1');
      databaseService.executeQuery.mockResolvedValue(mockRows);

      const result = await service.process('查询所有数据');

      expect(result.intent).toBe('sql');
      expect(result.sql).toBe('SELECT 1');
      expect(result.executed).toBe(true);
      expect(result.rows).toEqual(mockRows);
      expect(result.message).toContain('2');
      expect(chartAgent.generate).not.toHaveBeenCalled();
      expect(analysisAgent.generate).not.toHaveBeenCalled();
    });

    it('should return error result when SQL execution fails', async () => {
      routerAgent.recognize.mockResolvedValue('sql');
      sqlAgent.generate.mockResolvedValue('SELECT bad');
      databaseService.executeQuery.mockRejectedValue(new Error('syntax error'));

      const result = await service.process('查询');

      // Error result preserves the failing intent so the user knows which pipeline broke
      expect(result.intent).toBe('sql');
      expect(result.error?.code).toBe('PIPELINE_FAILED');
      expect(result.error?.message).toBe('syntax error');
    });
  });

  describe('chart intent', () => {
    it('should generate chart from rows', async () => {
      routerAgent.recognize.mockResolvedValue('chart');
      sqlAgent.generate.mockResolvedValue('SELECT category, SUM(amount) FROM sales');
      databaseService.executeQuery.mockResolvedValue(mockRows);
      chartAgent.generate.mockResolvedValue(mockChart);

      const result = await service.process('按类别显示柱状图');

      expect(result.intent).toBe('chart');
      expect(result.sql).toBeDefined();
      expect(result.rows).toEqual(mockRows);
      expect(result.chart).toEqual(mockChart);
      expect(chartAgent.generate).toHaveBeenCalledWith(mockRows, expect.any(String));
    });
  });

  describe('analysis intent', () => {
    it('should run analysis pipeline and return report', async () => {
      routerAgent.recognize.mockResolvedValue('analysis');
      sqlAgent.generate.mockResolvedValue('SELECT * FROM sales');
      databaseService.executeQuery.mockResolvedValue(mockRows);
      analysisAgent.generate.mockResolvedValue('趋势分析: 类别 B 表现最佳');

      const result = await service.process('分析销售趋势');

      expect(result.intent).toBe('analysis');
      expect(result.sql).toBe('SELECT * FROM sales');
      expect(result.rows).toEqual(mockRows);
      expect(result.analysis).toBe('趋势分析: 类别 B 表现最佳');
      expect(chartAgent.generate).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should return INTENT_FAILED when router throws', async () => {
      routerAgent.recognize.mockRejectedValue(new Error('router down'));

      const result = await service.process('任何问题');

      expect(result.intent).toBe('chat');
      expect(result.error?.code).toBe('INTENT_FAILED');
      expect(result.error?.message).toBe('router down');
    });

    it('should default to chat on unknown intent', async () => {
      // Cast to bypass type-safety for the unknown-intent test case
      routerAgent.recognize.mockResolvedValue('weird' as IntentType);

      const result = await service.process('test');

      expect(result.intent).toBe('chat');
    });
  });
});
