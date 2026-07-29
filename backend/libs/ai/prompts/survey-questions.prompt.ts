import type { GenerateSurveyQuestionsInput } from '../types.js';

const DEFAULT_CATEGORIES = ['delivery', 'codeQuality', 'cicd', 'teamHealth', 'blockers'];

export function buildSurveyQuestionsPrompt(input: GenerateSurveyQuestionsInput): string {
  const categories = input.categories && input.categories.length > 0 ? input.categories : DEFAULT_CATEGORIES;
  return `You are helping a software engineering manager draft a short developer pulse survey.

Project: ${input.projectName}
Reason this survey is being sent: ${input.trigger}
${input.customGuidance ? `Additional guidance from the admin: ${input.customGuidance}` : ''}

Generate 6-8 distinct survey questions covering these health categories: ${categories.join(', ')}.
Do not repeat or lightly reword the same underlying question.
Each question must be tagged with exactly one category. Mix "scale" (1-5 rating) and "text" (free response) question types.
Keep questions short, neutral, and non-leading. Do not ask for names or identifying details - responses are anonymous.

Respond with ONLY a JSON array, no markdown fences, no commentary, matching this shape (category must be one of: ${categories.join(', ')}):
[{"category": string, "questionText": string, "questionType": "text" | "scale"}]`;
}
