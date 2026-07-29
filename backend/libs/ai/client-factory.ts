import { GeminiAiClient } from './GeminiAiClient/gemini-ai.client.js';
import { StubAiClient } from './StubAiClient/stub-ai.client.js';
import { logger } from '../logger.js';
import type { AiClient } from './types.js';

const log = logger.child({ module: 'ai-client-factory' });

let cachedClient: AiClient | null = null;

export function createAiClient(apiKey: string | undefined, model: string): AiClient {
  if (!apiKey) {
    log.warn('GEMINI_API_KEY not set - using StubAiClient (placeholder AI output)');
    return new StubAiClient();
  }
  return new GeminiAiClient(apiKey, model);
}

/** Convenience singleton for callers that don't need to inject a client (matches env config directly). */
export function getAiClient(): AiClient {
  if (!cachedClient) {
    cachedClient = createAiClient(process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL ?? 'gemini-2.5-flash');
  }
  return cachedClient;
}
