/**
 * Shared question-generation pipeline: generate -> dedupe -> AI-score ->
 * quality-gate -> cap at MAX_COUNT. Used by both the admin-facing
 * "generate-questions" endpoint (survey.service.ts) and the auto-pulse
 * distribution processor, so the two flows can't silently drift apart.
 */

import type { AiClient, ScoredSurveyQuestion } from '@libs/ai/index.js';
import { dedupeQuestions } from '@libs/ai/index.js';
import { logger } from '@libs/logger.js';
import { env } from '../config/env.js';

const log = logger.child({ component: 'survey-question-generation' });

export interface GenerateQualityQuestionsInput {
  aiClient: AiClient;
  projectName: string;
  trigger: string;
  customGuidance?: string;
  categories: string[];
}

export async function generateQualityQuestions(input: GenerateQualityQuestionsInput): Promise<ScoredSurveyQuestion[]> {
  const { aiClient, projectName, trigger, customGuidance, categories } = input;

  const generated = await aiClient.generateSurveyQuestions({ trigger, customGuidance, projectName, categories });
  const deduped = dedupeQuestions(generated);

  let scores;
  try {
    scores = await aiClient.scoreSurveyQuestions({ projectName, trigger, questions: deduped });
  } catch (error) {
    // If scoring fails, don't block the caller - return the deduped set unscored (neutral score).
    log.warn({ error, projectName }, 'question scoring failed; returning deduped questions without a quality gate');
    return deduped.map((q) => ({ ...q, score: { relevance: 0, clarity: 0, importance: 0, diversity: 0, overall: 0 } }));
  }

  const scored: ScoredSurveyQuestion[] = deduped.map((q, i) => ({
    ...q,
    score: scores[i] ?? { relevance: 0, clarity: 0, importance: 0, diversity: 0, overall: 0 },
  }));

  const minScore = env.surveyQuestionMinScore;
  const gated = scored.filter((q) => q.score.overall >= minScore);
  // Never return an empty set purely because the gate was strict - fall back to the top few.
  const surviving = gated.length > 0 ? gated : [...scored].sort((a, b) => b.score.overall - a.score.overall).slice(0, 3);

  return surviving.sort((a, b) => b.score.overall - a.score.overall).slice(0, env.surveyQuestionMaxCount);
}
