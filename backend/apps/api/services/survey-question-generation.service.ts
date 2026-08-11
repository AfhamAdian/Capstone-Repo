/**
 * Shared question-generation pipeline: generate -> dedupe -> AI-score ->
 * quality-gate -> cap at MAX_COUNT. Used by both the admin-facing
 * "generate-questions" endpoint (survey.service.ts) and the auto-pulse
 * distribution processor, so the two flows can't silently drift apart.
 */

import type { AiClient, ScoredSurveyQuestion, SurveyHealthContext } from '@libs/ai/index.js';
import { dedupeQuestions } from '@libs/ai/index.js';
import { env } from '../config/env.js';

export interface GenerateQualityQuestionsInput {
  aiClient: AiClient;
  projectName: string;
  trigger: string;
  customGuidance?: string;
  categories: string[];
  healthContext?: SurveyHealthContext;
}

export async function generateQualityQuestions(input: GenerateQualityQuestionsInput): Promise<ScoredSurveyQuestion[]> {
  const { aiClient, projectName, trigger, customGuidance, categories, healthContext } = input;

  const generated = await aiClient.generateSurveyQuestions({ trigger, customGuidance, projectName, categories, healthContext });
  const deduped = dedupeQuestions(generated);
  if (deduped.length === 0) throw new Error('Gemini did not return any usable survey questions');

  const scores = await aiClient.scoreSurveyQuestions({ projectName, trigger, questions: deduped, healthContext });
  if (scores.length !== deduped.length) throw new Error('Gemini returned an incomplete question-score set');

  const scored: ScoredSurveyQuestion[] = deduped.map((q, i) => ({
    ...q,
    score: scores[i]!,
  }));

  const minScore = env.surveyQuestionMinScore;
  const gated = scored.filter((q) => q.score.overall >= minScore).sort((a, b) => b.score.overall - a.score.overall);
  if (gated.length === 0) throw new Error(`No generated question met the minimum quality score of ${minScore}`);

  const selected: ScoredSurveyQuestion[] = [];
  const seenCategories = new Set<string>();
  for (const question of gated) {
    if (!seenCategories.has(question.category)) {
      selected.push(question);
      seenCategories.add(question.category);
    }
    if (selected.length === env.surveyQuestionMaxCount) return selected;
  }
  for (const question of gated) {
    if (!selected.includes(question)) selected.push(question);
    if (selected.length === env.surveyQuestionMaxCount) break;
  }
  return selected;
}
