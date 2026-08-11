import type { AnalyzeSurveyResponsesInput } from '../types.js';
import { formatSurveyHealthContext } from './survey-questions.prompt.js';

export function buildSurveyAnalysisPrompt(input: AnalyzeSurveyResponsesInput): string {
  const responsesBlock = input.rawResponses
    .map((r) => `Category: ${r.category}\nQuestion: ${r.question}\nAnswers:\n${r.answers.map((a) => `- ${a}`).join('\n')}`)
    .join('\n\n');

  return `You are analyzing anonymous developer survey responses for project "${input.projectName}".

${formatSurveyHealthContext(input.healthContext)}

${responsesBlock}

Based on these responses:
1. Score each health category from 0-100 (100 = healthiest) based ONLY on the survey evidence in that category. The project health context is background for interpretation, not a target: do not copy, anchor to, or average with its scores. If a category has no scale-type answers, infer a reasonable score from the text answers' tone; if there is truly no signal for a category, use 50 (neutral).
2. Extract 3-5 short recurring themes (a few words each) that came up across the free-text answers.
3. Write a concise (2-4 sentence) insight summary a manager could act on.

Respond with ONLY JSON, no markdown fences, no commentary, matching this shape:
{
  "scores": {"delivery": number, "codeQuality": number, "cicd": number, "teamHealth": number, "blockers": number},
  "themes": string[],
  "aiInsight": string
}`;
}
