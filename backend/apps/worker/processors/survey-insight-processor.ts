/**
 * Survey Insight Processor
 * Runs Gemini analysis over one project's completed survey responses and
 * refreshes the blended project health score.
 */

import type { SurveyInsightJobData } from '@libs/queue/index.js';
import { logger } from '@libs/logger.js';
import { analyzeAndSaveSurveyInsight } from '../../api/services/survey-insight.service.js';
import { updateSurveyStatus } from '../../api/database/survey.js';

export async function processSurveyInsightJob(jobData: SurveyInsightJobData): Promise<void> {
  const { surveyId } = jobData;
  const log = logger.child({ component: 'survey-insight-processor', surveyId });

  try {
    await analyzeAndSaveSurveyInsight(surveyId);
  } catch (error) {
    await updateSurveyStatus(surveyId, 'failed', {
      analysisError: error instanceof Error ? error.message : 'Survey analysis failed',
    });
    log.error({ error }, 'survey insight generation failed');
    throw error;
  }
}
