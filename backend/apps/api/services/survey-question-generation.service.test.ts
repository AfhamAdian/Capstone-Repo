import { describe, it, expect } from 'vitest';
import { generateQualityQuestions } from './survey-question-generation.service.js';
import type { AiClient, GeneratedSurveyQuestion, QuestionScore } from '@libs/ai/index.js';

// Relies on the default env values (SURVEY_QUESTION_MIN_SCORE=60, SURVEY_QUESTION_MIN_COUNT=5,
// SURVEY_QUESTION_MAX_COUNT=6) - not overridden here.

const TOPICS = [
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
      questionSummaries: [],
    }),
    ...overrides,
  };
}

const baseInput = { projectName: 'Acme', trigger: 'test', categories: ['delivery'] };

describe('generateQualityQuestions', () => {
  it('drops below-gate questions when enough questions pass', async () => {
    const questions = TOPICS.slice(0, 6).map((t) => question(`Rate your experience with ${t}`));
    const client = fakeAiClient({
      generateSurveyQuestions: async () => questions,
      scoreSurveyQuestions: async () => [90, 85, 80, 75, 70, 10].map(score),
    });

    const result = await generateQualityQuestions({ aiClient: client, ...baseInput });

    expect(result).toHaveLength(5);
    expect(result.every((q) => q.score.overall >= 60)).toBe(true);
  });

  it('runs another generation round when too few questions pass the gate', async () => {
    let calls = 0;
    const client = fakeAiClient({
      generateSurveyQuestions: async () => {
        const batch = TOPICS.slice(calls * 3, calls * 3 + 3).map((t) => question(`Rate your experience with ${t}`));
        calls++;
        return batch;
      },
      scoreSurveyQuestions: async (input) => input.questions.map(() => score(80)),
    });

    const result = await generateQualityQuestions({ aiClient: client, ...baseInput });

    expect(calls).toBe(2);
    expect(result).toHaveLength(6);
  });

  it('tops up to the minimum with the best below-gate questions, ranked after passing ones', async () => {
    const questions = TOPICS.slice(0, 6).map((t) => question(`Rate your experience with ${t}`));
    const client = fakeAiClient({
      generateSurveyQuestions: async () => questions,
      scoreSurveyQuestions: async () => [90, 70, 50, 40, 30, 20].map(score),
    });

    const result = await generateQualityQuestions({ aiClient: client, ...baseInput });

    expect(result.map((q) => q.score.overall)).toEqual([90, 70, 50, 40, 30]);
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
    const questions = TOPICS.map((t) => question(`Rate your experience with ${t}`));
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
