import { describe, it, expect } from 'vitest';
import { generateQualityQuestions } from './survey-question-generation.service.js';
import type { AiClient, GeneratedSurveyQuestion, QuestionScore } from '@libs/ai/index.js';

// Relies on the default env values (SURVEY_QUESTION_MIN_SCORE=60, SURVEY_QUESTION_MAX_COUNT=6) - not overridden here.

function question(text: string): GeneratedSurveyQuestion {
  return { category: 'delivery', questionText: text, questionType: 'scale' };
}

function score(overall: number): QuestionScore {
  return { relevance: overall, clarity: overall, importance: overall, diversity: overall, overall };
}

function fakeAiClient(overrides: Partial<AiClient> = {}): AiClient {
  return {
    generateSurveyQuestions: async () => [],
    scoreSurveyQuestions: async () => [],
    analyzeSurveyResponses: async () => ({
      scores: { security: 0, reliability: 0, maintainability: 0, cicdDeploymentHealth: 0, teamHealth: 0, engineeringProcess: 0, planningExecution: 0 },
      themes: [],
      aiInsight: '',
    }),
    ...overrides,
  };
}

const baseInput = { projectName: 'Acme', trigger: 'test', categories: ['delivery'] };

describe('generateQualityQuestions', () => {
  it('drops questions scoring below the quality gate', async () => {
    const questions = [question('A distinct question about delivery risk'), question('A different question about cadence and confidence levels')];
    const client = fakeAiClient({
      generateSurveyQuestions: async () => questions,
      scoreSurveyQuestions: async () => [score(90), score(10)],
    });

    const result = await generateQualityQuestions({ aiClient: client, ...baseInput });

    expect(result).toHaveLength(1);
    expect(result[0]!.score.overall).toBe(90);
  });

  it('deduplicates near-identical questions before scoring', async () => {
    const questions = [
      question('How confident are you in hitting this sprint commitments'),
      question('How confident do you feel about hitting the sprint commitments'),
    ];
    let scoredCount = 0;
    const client = fakeAiClient({
      generateSurveyQuestions: async () => questions,
      scoreSurveyQuestions: async (input) => {
        scoredCount = input.questions.length;
        return input.questions.map(() => score(80));
      },
    });

    await generateQualityQuestions({ aiClient: client, ...baseInput });
    expect(scoredCount).toBe(1);
  });

  it('fails closed when question scoring fails', async () => {
    const questions = [question('A distinct question about delivery risk')];
    const client = fakeAiClient({
      generateSurveyQuestions: async () => questions,
      scoreSurveyQuestions: async () => {
        throw new Error('AI provider down');
      },
    });

    await expect(generateQualityQuestions({ aiClient: client, ...baseInput })).rejects.toThrow('AI provider down');
  });

  it('rejects a set when every question fails the quality gate', async () => {
    const questions = [question('Question one about delivery'), question('Question two about something else entirely')];
    const client = fakeAiClient({
      generateSurveyQuestions: async () => questions,
      scoreSurveyQuestions: async () => [score(10), score(20)],
    });

    await expect(generateQualityQuestions({ aiClient: client, ...baseInput })).rejects.toThrow(
      'No generated question met the minimum quality score',
    );
  });

  it('caps the result at SURVEY_QUESTION_MAX_COUNT (default 6), highest score first', async () => {
    const topics = [
      'sprint delivery confidence',
      'code review turnaround',
      'CI pipeline flakiness',
      'on-call burden lately',
      'blocked waiting on others',
      'tooling friction day to day',
      'onboarding pain points',
      'meeting load this month',
      'documentation gaps found',
      'cross-team handoff delays',
    ];
    const questions = topics.map((t) => question(`Rate your experience with ${t}`));
    const scores = questions.map((_, i) => score(61 + i)); // all clear the default min score of 60
    const client = fakeAiClient({
      generateSurveyQuestions: async () => questions,
      scoreSurveyQuestions: async () => scores,
    });

    const result = await generateQualityQuestions({ aiClient: client, ...baseInput });
    expect(result).toHaveLength(6);
    expect(result[0]!.score.overall).toBe(70); // highest score (61+9) sorted first
  });

  it('forwards the same immutable health context to generation and scoring', async () => {
    const healthContext = {
      capturedAt: '2026-08-11T00:00:00.000Z',
      overallScore: 42,
      scores: { security: 30, reliability: 50, maintainability: 40, cicdDeploymentHealth: 45, teamHealth: 60, engineeringProcess: 35, planningExecution: 25 },
      metricsSnapshotId: 12,
      source: 'risk_score' as const,
    };
    let generationContext: unknown;
    let scoringContext: unknown;
    const client = fakeAiClient({
      generateSurveyQuestions: async (input) => {
        generationContext = input.healthContext;
        return [question('How confident are you in the current delivery plan?')];
      },
      scoreSurveyQuestions: async (input) => {
        scoringContext = input.healthContext;
        return [score(90)];
      },
    });

    await generateQualityQuestions({ aiClient: client, ...baseInput, healthContext });
    expect(generationContext).toBe(healthContext);
    expect(scoringContext).toBe(healthContext);
  });
});
