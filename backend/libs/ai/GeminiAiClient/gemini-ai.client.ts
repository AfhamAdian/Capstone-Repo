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

export class GeminiAiClient implements AiClient {
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async generateSurveyQuestions(input: GenerateSurveyQuestionsInput): Promise<GeneratedSurveyQuestion[]> {
    const prompt = buildSurveyQuestionsPrompt(input);
    const response = await this.client.models.generateContent({ model: this.model, contents: prompt });
    const text = response.text;
    if (!text) {
      throw new Error('Gemini returned an empty response for survey question generation');
    }

    try {
      const parsed = JSON.parse(extractJson(text));
      if (!Array.isArray(parsed)) throw new Error('expected a JSON array');
      return parsed as GeneratedSurveyQuestion[];
    } catch (error) {
      log.error({ error, text }, 'failed to parse Gemini survey-question response');
      throw new Error('Failed to parse AI-generated survey questions');
    }
  }

  async scoreSurveyQuestions(input: ScoreSurveyQuestionsInput): Promise<QuestionScore[]> {
    if (input.questions.length === 0) return [];
    const prompt = buildSurveyQuestionScoringPrompt(input);
    const response = await this.client.models.generateContent({ model: this.model, contents: prompt });
    const text = response.text;
    if (!text) {
      throw new Error('Gemini returned an empty response for survey question scoring');
    }

    try {
      const parsed = JSON.parse(extractJson(text));
      if (!Array.isArray(parsed)) throw new Error('expected a JSON array');
      return parsed as QuestionScore[];
    } catch (error) {
      log.error({ error, text }, 'failed to parse Gemini question-scoring response');
      throw new Error('Failed to parse AI question scores');
    }
  }

  async analyzeSurveyResponses(input: AnalyzeSurveyResponsesInput): Promise<AnalyzeSurveyResponsesOutput> {
    const prompt = buildSurveyAnalysisPrompt(input);
    const response = await this.client.models.generateContent({ model: this.model, contents: prompt });
    const text = response.text;
    if (!text) {
      throw new Error('Gemini returned an empty response for survey response analysis');
    }

    try {
      return JSON.parse(extractJson(text)) as AnalyzeSurveyResponsesOutput;
    } catch (error) {
      log.error({ error, text }, 'failed to parse Gemini survey-analysis response');
      throw new Error('Failed to parse AI survey analysis');
    }
  }
}
