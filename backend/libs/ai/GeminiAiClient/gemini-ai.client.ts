import { GoogleGenAI } from '@google/genai';
import { logger } from '../../logger.js';
import { buildSurveyQuestionsPrompt } from '../prompts/survey-questions.prompt.js';
import { buildSurveyAnalysisPrompt } from '../prompts/survey-analysis.prompt.js';
import { buildSurveyQuestionScoringPrompt } from '../prompts/survey-question-scoring.prompt.js';
import type {
  AiClient,
  AnalyzeSurveyResponsesInput,
  AnalyzeSurveyResponsesOutput,
  GenerateSurveyQuestionsInput,
  GeneratedSurveyQuestion,
  QuestionScore,
  ScoreSurveyQuestionsInput,
} from '../types.js';

const log = logger.child({ module: 'gemini-ai-client' });

/** Strips markdown fences the model sometimes adds despite instructions not to. */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? text).trim();
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function boundedScore(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${label} must be a number from 0 to 100`);
  }
  return value;
}

function parseQuestions(value: unknown): GeneratedSurveyQuestion[] {
  if (!Array.isArray(value)) throw new Error('expected a JSON array');
  return value.map((item, index) => {
    const row = asRecord(item, `question ${index + 1}`);
    if (typeof row.category !== 'string' || !row.category.trim()) throw new Error(`question ${index + 1} has no category`);
    if (typeof row.questionText !== 'string' || !row.questionText.trim()) throw new Error(`question ${index + 1} has no text`);
    if (row.questionType !== 'text' && row.questionType !== 'scale') throw new Error(`question ${index + 1} has an invalid type`);
    return {
      category: row.category.trim(),
      questionText: row.questionText.trim(),
      questionType: row.questionType,
    };
  });
}

function parseQuestionScores(value: unknown, expectedCount: number): QuestionScore[] {
  if (!Array.isArray(value) || value.length !== expectedCount) {
    throw new Error(`expected ${expectedCount} question scores`);
  }
  return value.map((item, index) => {
    const row = asRecord(item, `question score ${index + 1}`);
    return {
      relevance: boundedScore(row.relevance, 'relevance'),
      clarity: boundedScore(row.clarity, 'clarity'),
      importance: boundedScore(row.importance, 'importance'),
      diversity: boundedScore(row.diversity, 'diversity'),
      overall: boundedScore(row.overall, 'overall'),
      ...(typeof row.reason === 'string' ? { reason: row.reason.trim() } : {}),
    };
  });
}

function parseAnalysis(value: unknown): AnalyzeSurveyResponsesOutput {
  const row = asRecord(value, 'analysis');
  const scores = asRecord(row.scores, 'analysis scores');
  if (!Array.isArray(row.themes) || !row.themes.every((theme) => typeof theme === 'string')) {
    throw new Error('analysis themes must be strings');
  }
  if (typeof row.aiInsight !== 'string' || !row.aiInsight.trim()) {
    throw new Error('analysis insight must be non-empty');
  }
  return {
    scores: {
      delivery: boundedScore(scores.delivery, 'delivery score'),
      codeQuality: boundedScore(scores.codeQuality, 'code quality score'),
      cicd: boundedScore(scores.cicd, 'CI/CD score'),
      teamHealth: boundedScore(scores.teamHealth, 'team health score'),
      blockers: boundedScore(scores.blockers, 'blockers score'),
    },
    themes: row.themes.map((theme) => (theme as string).trim()).filter(Boolean).slice(0, 5),
    aiInsight: row.aiInsight.trim(),
  };
}

export class GeminiAiClient implements AiClient {
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async generateSurveyQuestions(input: GenerateSurveyQuestionsInput): Promise<GeneratedSurveyQuestion[]> {
    const prompt = buildSurveyQuestionsPrompt(input);
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });
    const text = response.text;
    if (!text) {
      throw new Error('Gemini returned an empty response for survey question generation');
    }

    try {
      return parseQuestions(JSON.parse(extractJson(text)));
    } catch (error) {
      log.error({ error, text }, 'failed to parse Gemini survey-question response');
      throw new Error('Failed to parse AI-generated survey questions');
    }
  }

  async scoreSurveyQuestions(input: ScoreSurveyQuestionsInput): Promise<QuestionScore[]> {
    if (input.questions.length === 0) return [];
    const prompt = buildSurveyQuestionScoringPrompt(input);
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });
    const text = response.text;
    if (!text) {
      throw new Error('Gemini returned an empty response for survey question scoring');
    }

    try {
      return parseQuestionScores(JSON.parse(extractJson(text)), input.questions.length);
    } catch (error) {
      log.error({ error, text }, 'failed to parse Gemini question-scoring response');
      throw new Error('Failed to parse AI question scores');
    }
  }

  async analyzeSurveyResponses(input: AnalyzeSurveyResponsesInput): Promise<AnalyzeSurveyResponsesOutput> {
    const prompt = buildSurveyAnalysisPrompt(input);
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });
    const text = response.text;
    if (!text) {
      throw new Error('Gemini returned an empty response for survey response analysis');
    }

    try {
      return parseAnalysis(JSON.parse(extractJson(text)));
    } catch (error) {
      log.error({ error, text }, 'failed to parse Gemini survey-analysis response');
      throw new Error('Failed to parse AI survey analysis');
    }
  }
}
