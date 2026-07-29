import type {
  AiClient,
  AnalyzeSurveyResponsesInput,
  AnalyzeSurveyResponsesOutput,
  GenerateSurveyQuestionsInput,
  GeneratedSurveyQuestion,
  QuestionScore,
  ScoreSurveyQuestionsInput,
} from '../types.js';

/**
 * Used when GEMINI_API_KEY isn't configured (local dev) so the rest of the
 * survey pipeline can be built/tested without a live AI dependency.
 */
export class StubAiClient implements AiClient {
  async generateSurveyQuestions(_input: GenerateSurveyQuestionsInput): Promise<GeneratedSurveyQuestion[]> {
    return [
      { category: 'delivery', questionText: 'How confident are you in hitting this sprint\'s commitments?', questionType: 'scale' },
      { category: 'teamHealth', questionText: 'What is currently making it hardest to get work done?', questionType: 'text' },
      { category: 'blockers', questionText: 'How often are you blocked waiting on someone else this week?', questionType: 'scale' },
      { category: 'codeQuality', questionText: 'Any part of the codebase you\'re avoiding touching? Why?', questionType: 'text' },
    ];
  }

  async scoreSurveyQuestions(input: ScoreSurveyQuestionsInput): Promise<QuestionScore[]> {
    // Deterministic mid-high scores so the quality gate passes questions through in local dev.
    return input.questions.map(() => ({
      relevance: 75,
      clarity: 75,
      importance: 75,
      diversity: 75,
      overall: 75,
      reason: 'stub-ai-client: no real scoring performed',
    }));
  }

  async analyzeSurveyResponses(_input: AnalyzeSurveyResponsesInput): Promise<AnalyzeSurveyResponsesOutput> {
    return {
      scores: { delivery: 50, codeQuality: 50, cicd: 50, teamHealth: 50, blockers: 50 },
      themes: ['stub-ai-client: no real analysis performed'],
      aiInsight: 'AI analysis is not configured (GEMINI_API_KEY missing) - this is placeholder output.',
    };
  }
}
