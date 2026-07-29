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
    analyzeSurveyResponses: async () => ({ scores: { delivery: 0, codeQuality: 0, cicd: 0, teamHealth: 0, blockers: 0 }, themes: [], aiInsight: '' }),
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

  it('falls back to the deduped set (unscored) if scoring throws, rather than failing the caller', async () => {
    const questions = [question('A distinct question about delivery risk')];
    const client = fakeAiClient({
      generateSurveyQuestions: async () => questions,
      scoreSurveyQuestions: async () => {
        throw new Error('AI provider down');
      },
    });

    const result = await generateQualityQuestions({ aiClient: client, ...baseInput });
    expect(result).toHaveLength(1);
    expect(result[0]!.score.overall).toBe(0);
  });

  it('never returns an empty set purely because every question failed the gate - falls back to the top few', async () => {
    const questions = [question('Question one about delivery'), question('Question two about something else entirely')];
    const client = fakeAiClient({
      generateSurveyQuestions: async () => questions,
      scoreSurveyQuestions: async () => [score(10), score(20)],
    });

    const result = await generateQualityQuestions({ aiClient: client, ...baseInput });
    expect(result.length).toBeGreaterThan(0);
    // Best-scoring question should be first.
    expect(result[0]!.score.overall).toBe(20);
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
});
