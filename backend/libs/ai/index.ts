/**
 * AI module exports (survey question generation + response analysis)
 */

export type {
  AiClient,
  SurveyQuestionCategory,
  SurveyQuestionType,
  SurveyHealthContext,
  SurveyIncidentSignals,
  HealthTrendLabel,
  CategoryTrend,
  GeneratedSurveyQuestion,
  GenerateSurveyQuestionsInput,
  QuestionScore,
  ScoredSurveyQuestion,
  ScoreSurveyQuestionsInput,
  RawSurveyResponseForAnalysis,
  SurveyCategoryScores,
  AnalyzeSurveyResponsesInput,
  AnalyzeSurveyResponsesOutput,
  QuestionSummary,
} from './types.js';

export { createAiClient, getAiClient } from './client-factory.js';
export { dedupeQuestions } from './dedup.js';
