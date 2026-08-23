/**
 * AI module exports (survey question generation + response analysis)
 */

export type {
  AiClient,
  SurveyQuestionCategory,
  SurveyQuestionType,
  SurveyHealthContext,
  SurveyIncidentSignals,
  GeneratedSurveyQuestion,
  GenerateSurveyQuestionsInput,
  QuestionScore,
  ScoredSurveyQuestion,
  ScoreSurveyQuestionsInput,
  RawSurveyResponseForAnalysis,
  SurveyCategoryScores,
  AnalyzeSurveyResponsesInput,
  AnalyzeSurveyResponsesOutput,
} from './types.js';

export { createAiClient, getAiClient } from './client-factory.js';
export { dedupeQuestions } from './dedup.js';
