/**
 * Shared survey analysis: Gemini scores, themes, and narrative written onto
 * survey.insight. Kept independent of the risk engine - never blended into
 * projecthealthscore. Used by the close endpoint (inline) and the insight
 * worker (deadline / retry).
 */

import { getAiClient } from '@libs/ai/index.js';
import { logger } from '@libs/logger.js';
import { env } from '../config/env.js';
import {
  getSurveyById,
  getRawResponsesForSurvey,
  getDerivedCounts,
  updateSurveyStatus,
  saveInsight,
  categoryForAnalysis,
} from '../database/survey.js';
import { getProjectName } from '../database/project.js';

const log = logger.child({ component: 'survey-insight-service' });

export async function analyzeAndSaveSurveyInsight(surveyId: number): Promise<void> {
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    log.error({ surveyId }, 'survey not found, skipping insight generation');
    return;
  }
  if (survey.status === 'completed' && survey.insight) {
    return;
  }

  const [projectName, rawResponses, counts] = await Promise.all([
    getProjectName(survey.project_id),
    getRawResponsesForSurvey(surveyId),
    getDerivedCounts(surveyId),
  ]);

  const hasAnswers = rawResponses.some((r) => r.answers.length > 0);
  if (counts.responseCount < 1 || !hasAnswers) {
    await updateSurveyStatus(surveyId, 'completed', {
      completedAt: new Date(),
      analysisError: `insufficient_responses:${counts.responseCount}/${env.surveyMinAnonymousResponses}`,
    });
    log.warn({ surveyId, responseCount: counts.responseCount }, 'no responses to score');
    return;
  }

  const analysis = await getAiClient().analyzeSurveyResponses({
    projectName,
    healthContext: survey.health_context ?? undefined,
    rawResponses: rawResponses.map((r) => ({
      question: r.question,
      category: categoryForAnalysis(r.category),
      answers: r.answers,
    })),
  });

  await saveInsight(surveyId, {
    aiInsight: analysis.aiInsight,
    themes: analysis.themes,
    scores: analysis.scores,
    aiModel: env.geminiApiKey ? env.geminiModel : 'stub',
    generatedAt: new Date().toISOString(),
  });

  await updateSurveyStatus(surveyId, 'completed', {
    completedAt: new Date(),
    analysisError: counts.responseCount < env.surveyMinAnonymousResponses
      ? `raw_responses_hidden:${counts.responseCount}/${env.surveyMinAnonymousResponses}`
      : null,
  });

  log.info({ surveyId, responseCount: counts.responseCount }, 'survey insight generated');
}
