import { LlmService } from './llm.service';

/**
 * Reusable LlmService mock for unit tests.
 *
 * Tests inject this via Nest's Test module:
 *   { provide: LlmService, useValue: createLlmMock() }
 *
 * By default every method rejects — that's the same behavior as a real
 * LLM API call failing, which is what triggers each agent's fallback path.
 * Tests that want the LLM path can override individual methods:
 *   const llm = createLlmMock();
 *   llm.invokeStructured.mockResolvedValue({ intent: 'sql' });
 */
export function createLlmMock(): jest.Mocked<LlmService> {
  return {
    invoke: jest.fn().mockRejectedValue(new Error('LLM not available in tests')),
    invokeStructured: jest
      .fn()
      .mockRejectedValue(new Error('LLM not available in tests')),
    ping: jest.fn().mockResolvedValue(false),
  } as unknown as jest.Mocked<LlmService>;
}