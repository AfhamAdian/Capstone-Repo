/**
 * Survey Insight Processor
 * Runs Gemini analysis over one project's completed survey responses and
 * refreshes the blended project health score.
 */

import type { SurveyInsightJobData } from '@libs/queue/index.js';
import { createAiClient, type SurveyQuestionCategory } from '@libs/ai/index.js';
import { logger } from '@libs/logger.js';
import { getSurveyById, getRawResponsesForSurvey } from '../../api/database/survey.js';
import { getProjectName } from '../../api/database/project.js';
import { getRubricCategoryMap } from '../../api/database/survey-category.js';
import { saveInsight } from '../../api/database/survey-insight.js';
import { blendAndSaveProjectHealthScore } from '../../api/services/health-score-blend.service.js';
import { env } from '../../api/config/env.js';

const aiClient = createAiClient(env.geminiApiKey, env.geminiModel);

export async function processSurveyInsightJob(jobData: SurveyInsightJobData): Promise<void> {
  const { surveyId } = jobData;
  const log = logger.child({ component: 'survey-insight-processor', surveyId });

  const survey = await getSurveyById(surveyId);
  if (!survey) {
    log.error('survey not found, skipping insight generation');
    return;
  }

  const [projectName, rawResponses] = await Promise.all([
    getProjectName(survey.project_id),
    getRawResponsesForSurvey(surveyId),
  ]);

  if (rawResponses.length === 0 || rawResponses.every((r) => r.answers.length === 0)) {
    log.warn('no answered questions for this survey, skipping AI analysis');
    return;
  }

  // Questions may be tagged with a custom category (e.g. "onboarding") rather
  // than one of the 5 built-in rubric buckets the AI scores against. Translate
  // each question's category key to its rubric bucket before analysis so
  // custom-category answers still count toward scoring instead of being
  // silently dropped (see backend/apps/api/src/database/survey-category.ts).
  const rubricByKey = await getRubricCategoryMap();
  const analysis = await aiClient.analyzeSurveyResponses({
    projectName,
    rawResponses: rawResponses.map((r) => ({
      question: r.question,
      category: (rubricByKey.get(r.category) ?? (r.category as SurveyQuestionCategory)),
      answers: r.answers,
    })),
  });

  await saveInsight({
    surveyId,
    aiInsight: analysis.aiInsight,
    themes: analysis.themes,
    scores: analysis.scores,
    aiModel: env.geminiApiKey ? env.geminiModel : 'stub',
  });

  await blendAndSaveProjectHealthScore(survey.project_id);

  log.info('survey insight generated and health score blended');
}
