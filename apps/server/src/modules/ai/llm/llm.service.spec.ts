import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LlmService } from './llm.service';
import { z } from 'zod';

/**
 * Tests for LlmService — we exercise the JSON-extraction and
 * plain-word coercion paths directly by stubbing the internal
 * ChatOllama with a fake `invoke` returning canned strings.
 *
 * We do NOT exercise the real Ollama round-trip here — that needs a
 * running daemon and is covered by the smoke tests against the live
 * server. This file is about the parsing contract.
 */
describe('LlmService', () => {
  let service: LlmService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmService,
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();
    service = module.get<LlmService>(LlmService);
  });

  describe('parseAndValidate (via invokeStructured)', () => {
    /**
     * Reach into the private parser for direct testing. We keep the
     * type loose — the method exists, that's all we care about here.
     */
    const callParser = (raw: string, schema: z.ZodTypeAny) =>
      (service as unknown as {
        parseAndValidate: (r: string, s: z.ZodTypeAny) => unknown;
      }).parseAndValidate(raw, schema);

    const IntentSchema = z.enum(['sql', 'chart', 'analysis', 'chat']);
    const ObjectSchema = z.object({ intent: IntentSchema });

    it('accepts well-formed JSON', () => {
      expect(callParser('{"intent":"sql"}', ObjectSchema)).toEqual({
        intent: 'sql',
      });
    });

    it('strips markdown fences', () => {
      expect(
        callParser('```json\n{"intent":"chart"}\n```', ObjectSchema),
      ).toEqual({ intent: 'chart' });
    });

    it('accepts a plain enum word for ZodEnum schemas', () => {
      // qwen2.5:3b frequently returns just "sql" without JSON wrapping.
      expect(callParser('sql', ObjectSchema)).toEqual({ intent: 'sql' });
      expect(callParser('analysis', ObjectSchema)).toEqual({ intent: 'analysis' });
    });

    it('accepts plain word surrounded by prose', () => {
      expect(callParser('The intent is: chat', ObjectSchema)).toEqual({
        intent: 'chat',
      });
    });

    it('rejects garbage output', () => {
      expect(() => callParser('totally unrelated text', ObjectSchema)).toThrow(
        /LLM/,
      );
    });
  });
});