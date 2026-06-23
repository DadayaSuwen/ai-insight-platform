import { Test, TestingModule } from '@nestjs/testing';
import { AnalysisAgent } from './analysis.agent';
import { LlmService } from '../llm/llm.service';
import { createLlmMock } from '../llm/llm.mock';

describe('AnalysisAgent', () => {
  let agent: AnalysisAgent;
  let llmMock: ReturnType<typeof createLlmMock>;

  const mockData = [
    { region: 'North', amount: 1200 },
    { region: 'South', amount: 900 },
    { region: 'East', amount: 600 },
  ];

  beforeEach(async () => {
    llmMock = createLlmMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalysisAgent,
        { provide: LlmService, useValue: llmMock },
      ],
    }).compile();
    agent = module.get<AnalysisAgent>(AnalysisAgent);
  });

  describe('fallback (LLM down)', () => {
    it('should produce a template report with summary stats', async () => {
      const text = await agent.generate(mockData, '按地区看销售额');
      expect(text).toContain('按地区看销售额');
      expect(text).toContain('3 条记录');
      expect(text).toContain('总和');
    });

    it('should return a no-data message when data is empty', async () => {
      const text = await agent.generate([], '按地区看销售额');
      expect(text).toContain('未查询到');
    });
  });

  describe('LLM path', () => {
    it('should use LLM response when available', async () => {
      llmMock.invoke.mockResolvedValue('北部地区销售额最高,占总收入的 44%。');
      const text = await agent.generate(mockData, '哪个地区卖得最好');
      expect(text).toContain('北部地区');
      expect(text).not.toContain('注: 当前为基础模板');
      expect(llmMock.invoke).toHaveBeenCalledTimes(1);
    });

    it('should fall back when LLM returns empty string', async () => {
      llmMock.invoke.mockResolvedValue('');
      const text = await agent.generate(mockData, 'x');
      expect(text).toContain('总和');
    });

    it('should truncate large datasets before sending to LLM', async () => {
      llmMock.invoke.mockResolvedValue('分析');
      const big = Array.from({ length: 200 }, (_, i) => ({ x: i, y: i * 2 }));
      await agent.generate(big, 'summary');
      const passed = llmMock.invoke.mock.calls[0][0];
      expect(passed.human.length).toBeLessThan(20_000); // sanity check, not exact
    });
  });
});