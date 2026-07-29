import type { ScoreSurveyQuestionsInput } from '../types.js';

/**
 * Asks the model to score each candidate question on the four quality
 * dimensions the spec requires (relevance, clarity, importance, diversity),
 * plus a holistic `overall` used as the quality gate. The questions are
 * numbered so the response array can be matched back positionally.
 */
export function buildSurveyQuestionScoringPrompt(input: ScoreSurveyQuestionsInput): string {
  const numbered = input.questions
    .map((q, i) => `${i + 1}. [${q.category} / ${q.questionType}] ${q.questionText}`)
    .join('\n');

  return `You are a survey methodology expert reviewing draft questions for an anonymous developer pulse survey.

Project: ${input.projectName}
Reason this survey is being sent: ${input.trigger}

Candidate questions (evaluate each in the context of the whole set):
${numbered}

Score EVERY question from 0 to 100 on each dimension:
- relevance: how well it fits this project and the reason above.
- clarity: how unambiguous and easy to answer it is (a leading, double-barrelled, or vague question scores low).
- importance: how actionable/valuable the answer would be to an engineering manager.
- diversity: how distinct it is from the OTHER questions in this set (a near-duplicate scores low).
- overall: your holistic judgement of whether this question earns its place in a short survey.

Respond with ONLY a JSON array, no markdown fences, no commentary, one object per question IN THE SAME ORDER, matching:
[{"relevance": number, "clarity": number, "importance": number, "diversity": number, "overall": number, "reason": string}]`;
}
