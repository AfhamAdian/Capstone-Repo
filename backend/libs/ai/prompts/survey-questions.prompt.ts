import type { GenerateSurveyQuestionsInput, SurveyHealthContext } from '../types.js';

const DEFAULT_CATEGORIES = ['delivery', 'codeQuality', 'cicd', 'teamHealth', 'blockers'];

export function formatSurveyHealthContext(context?: SurveyHealthContext): string {
  if (!context || context.source === 'unavailable') {
    return 'Project health context: no calculated project health score is available yet.';
  }
  const score = (value: number | null) => (value === null ? 'unavailable' : value.toFixed(1));
  return `Project health context captured at ${context.capturedAt}:
- Overall: ${score(context.overallScore)}
- Delivery: ${score(context.scores.delivery)}
- Code quality: ${score(context.scores.codeQuality)}
- CI/CD: ${score(context.scores.cicd)}
- Team health: ${score(context.scores.teamHealth)}
- Blockers: ${score(context.scores.blockers)}
- Overall trend delta: ${score(context.trendDelta)}`;
}

export function buildSurveyQuestionsPrompt(input: GenerateSurveyQuestionsInput): string {
  const categories = input.categories && input.categories.length > 0 ? input.categories : DEFAULT_CATEGORIES;
  return `You are helping a software engineering manager draft a short developer pulse survey.

Project: ${input.projectName}
Reason this survey is being sent: ${input.trigger}
${input.customGuidance ? `Additional guidance from the admin: ${input.customGuidance}` : ''}

${formatSurveyHealthContext(input.healthContext)}

Generate 6-8 distinct survey questions covering these health categories: ${categories.join(', ')}.
Use the health context to prioritize weak or declining areas, but do not mention
the numeric scores in the questions and do not assume the score is correct.
Do not repeat or lightly reword the same underlying question.
Each question must be tagged with exactly one category. Mix "scale" (1-5 rating) and "text" (free response) question types.
Keep questions short, neutral, and non-leading. Do not ask for names or identifying details - responses are anonymous.

Respond with ONLY a JSON array, no markdown fences, no commentary, matching this shape (category must be one of: ${categories.join(', ')}):
[{"category": string, "questionText": string, "questionType": "text" | "scale"}]`;
}
