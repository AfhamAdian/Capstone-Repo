import type { AnalyzeSurveyResponsesInput } from '../types.js';
import { formatSurveyHealthContext } from './survey-questions.prompt.js';

export function buildSurveyAnalysisPrompt(input: AnalyzeSurveyResponsesInput): string {
  const responsesBlock = input.rawResponses
    .map((r) => `Category: ${r.category}\nQuestion: ${r.question}\nAnswers:\n${r.answers.map((a) => `- ${a}`).join('\n')}`)
    .join('\n\n');

  return `You are analyzing anonymous developer survey responses for project "${input.projectName}". ${input.totalRespondents} respondent(s) submitted answers in total.

${formatSurveyHealthContext(input.healthContext)}

${responsesBlock}

Based on these responses:
1. Score each health category from 0-100 (100 = healthiest) based ONLY on the survey evidence in that category. The project health context is background for interpretation, not a target: do not copy, anchor to, or average with its scores. If a category has no scale-type answers, infer a reasonable score from the text answers' tone; if there is truly no signal for a category, use 50 (neutral).
2. Write 3-5 evidence-based insight bullets. Each must be one full sentence that cites how many of the ${input.totalRespondents} respondents support it, e.g. "3 of ${input.totalRespondents} responses cite unclear sprint scope as a blocker." Base counts only on the answers actually given - do not guess beyond what the text supports.
3. Write a concise (2-4 sentence) insight summary a manager could act on.
4. For each question listed above, write one short sentence summarizing what its answers show (e.g. "Most respondents rated confidence low (2/5), citing unresolved dependencies."). Return these in the same order as the questions above.

Respond with ONLY JSON, no markdown fences, no commentary, matching this shape:
{
  "scores": {"security": number, "reliability": number, "maintainability": number, "cicdDeploymentHealth": number, "teamHealth": number, "engineeringProcess": number, "planningExecution": number},
  "themes": string[],
  "aiInsight": string,
  "questionSummaries": [{"question": string, "summary": string}]
}`;
}
