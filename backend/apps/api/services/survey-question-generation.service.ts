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

const MAX_GENERATION_ROUNDS = 3;

export async function generateQualityQuestions(input: GenerateQualityQuestionsInput): Promise<ScoredSurveyQuestion[]> {
  const { aiClient, projectName, trigger, customGuidance, categories, healthContext } = input;
  const minScore = env.surveyQuestionMinScore;
  const minCount = env.surveyQuestionMinCount;
  const passes = (q: ScoredSurveyQuestion) => q.score.overall >= minScore;

  // Extra rounds only run when too few distinct questions clear the gate; each round is a fresh
  // high-temperature generation, so it adds new candidates rather than repeating the last set.
  const scored: ScoredSurveyQuestion[] = [];
  for (let round = 0; round < MAX_GENERATION_ROUNDS && scored.filter(passes).length < minCount; round++) {
    const generated = await aiClient.generateSurveyQuestions({ trigger, customGuidance, projectName, categories, healthContext });
    const fresh = dedupeQuestions([...scored, ...generated]).slice(scored.length);
    if (fresh.length === 0) continue;

    const scores = await aiClient.scoreSurveyQuestions({ projectName, trigger, questions: fresh, healthContext });
    if (scores.length !== fresh.length) throw new Error('Gemini returned an incomplete question-score set');
    scored.push(...fresh.map((q, i) => ({ ...q, score: scores[i]! })));
  }
  if (scored.length === 0) throw new Error('Gemini did not return any usable survey questions');

  const byScore = (a: ScoredSurveyQuestion, b: ScoredSurveyQuestion) => b.score.overall - a.score.overall;
  const gated = scored.filter(passes).sort(byScore);
  if (gated.length === 0) throw new Error(`No generated question met the minimum quality score of ${minScore}`);

  // Last resort to honour the minimum: the best below-gate questions, ranked after every passing one.
  if (gated.length < minCount) {
    gated.push(...scored.filter((q) => !passes(q)).sort(byScore).slice(0, minCount - gated.length));
  }

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
