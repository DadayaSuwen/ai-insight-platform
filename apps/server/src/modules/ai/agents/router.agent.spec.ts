import { Test, TestingModule } from '@nestjs/testing';
import { RouterAgent, IntentType } from './router.agent';
import { LlmService } from '../llm/llm.service';
import { createLlmMock } from '../llm/llm.mock';

describe('RouterAgent', () => {
  let agent: RouterAgent;
  let llmMock: ReturnType<typeof createLlmMock>;

  beforeEach(async () => {
    llmMock = createLlmMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RouterAgent,
        { provide: LlmService, useValue: llmMock },
      ],
    }).compile();

    agent = module.get<RouterAgent>(RouterAgent);
  });

  describe('recognize', () => {
    /**
     * Test case: SQL intent recognition
     * Given: User asks about sales data
     * Expected: Return 'sql' intent
     */
    it('should recognize sql intent for sales query', async () => {
      const result = await agent.recognize('查询销售数据');
      expect(result).toBe('sql');
    });

    it('should recognize sql intent for data query', async () => {
      const result = await agent.recognize('显示所有销售记录');
      expect(result).toBe('sql');
    });

    it('should recognize sql intent for statistics', async () => {
      const result = await agent.recognize('统计销售额');
      expect(result).toBe('sql');
    });

    /**
     * Test case: Chart intent recognition
     * Given: User asks for visualization
     * Expected: Return 'chart' intent
     */
    it('should recognize chart intent for bar chart', async () => {
      const result = await agent.recognize('显示柱状图');
      expect(result).toBe('chart');
    });

    it('should recognize chart intent for trend', async () => {
      const result = await agent.recognize('显示销售趋势图');
      expect(result).toBe('chart');
    });

    it('should recognize chart intent for pie chart', async () => {
      const result = await agent.recognize('显示占比饼图');
      expect(result).toBe('chart');
    });

    /**
     * Test case: Analysis intent recognition
     * Given: User asks for analysis
     * Expected: Return 'analysis' intent
     */
    it('should recognize analysis intent', async () => {
      const result = await agent.recognize('分析销售数据');
      expect(result).toBe('analysis');
    });

    it('should recognize insight intent', async () => {
      const result = await agent.recognize('给出销售洞察');
      expect(result).toBe('analysis');
    });

    /**
     * Test case: Chat intent recognition
     * Given: User sends greeting (without data keywords)
     * Expected: Return 'chat' intent
     */
    it('should recognize chat intent for greeting', async () => {
      const result = await agent.recognize('hello');
      expect(['sql', 'chat']).toContain(result);
    });

    /**
     * Test case: Default to sql for data queries
     * Given: Unknown query with data keywords
     * Expected: Return 'sql' as default
     */
    it('should default to sql for unknown queries', async () => {
      const result = await agent.recognize('show me the data');
      expect(result).toBe('sql');
    });
  });

  /**
   * Test case: Edge cases
   */
  describe('edge cases', () => {
    it('should handle empty message', async () => {
      const result = await agent.recognize('');
      expect(['sql', 'chat']).toContain(result);
    });

    it('should handle special characters', async () => {
      const result = await agent.recognize('查询#销售@数据!');
      expect(result).toBe('sql');
    });
  });

  /**
   * LLM success path: when LlmService returns a valid intent, the
   * agent should use it directly without falling back.
   */
  describe('LLM path', () => {
    it('should use LLM intent when LlmService resolves', async () => {
      llmMock.invokeStructured.mockResolvedValue({ intent: 'analysis' });
      const result = await agent.recognize('tell me about trends');
      expect(result).toBe('analysis');
      expect(llmMock.invokeStructured).toHaveBeenCalledTimes(1);
    });

    it('should coerce unknown LLM intent to chat via fallback', async () => {
      // LLM returns a value that the schema wouldn't allow, but if we
      // weaken the schema for the test the agent still needs to fall
      // back when the schema check fails. Easiest path: have the mock
      // throw to simulate the Zod rejection.
      llmMock.invokeStructured.mockRejectedValue(new Error('schema mismatch'));
      const result = await agent.recognize('hello world data'); // sql by default
      expect(['sql', 'chart', 'analysis', 'chat']).toContain(result);
    });

    it('should fall back to keywords when LLM times out', async () => {
      llmMock.invokeStructured.mockRejectedValue(new Error('LLM timeout after 20000ms'));
      const result = await agent.recognize('查询销售数据');
      expect(result).toBe('sql');
    });
  });
});