/**
 * Survey Send Processor
 * Generates questions (if needed) then broadcasts one anonymous shared link.
 */

import type { SurveySendJobData } from '@libs/queue/index.js';
import { getAiClient } from '@libs/ai/index.js';
import { logger } from '@libs/logger.js';
import {
  getSurveyById,
  updateSurveyStatus,
  replaceSurveyQuestions,
  listCategoryKeys,
} from '../../api/database/survey.js';
import { getProjectName } from '../../api/database/project.js';
import { generateQualityQuestions } from '../../api/services/survey-question-generation.service.js';
import {
  dispatchAnonymousSurveyBroadcast,
  surveyLinkExpiryFromNow,
} from '../../api/services/survey-dispatch.service.js';

export async function processSurveySendJob(jobData: SurveySendJobData): Promise<void> {
  const { surveyId } = jobData;
  const log = logger.child({ component: 'survey-send-processor', surveyId });

  const survey = await getSurveyById(surveyId);
  if (!survey) {
    log.error('survey not found, skipping send');
    return;
  }

  try {
    if (survey.questions.length === 0) {
      const projectName = await getProjectName(survey.project_id);
      const scored = await generateQualityQuestions({
        aiClient: getAiClient(),
        projectName,
        trigger: survey.trigger,
        customGuidance: survey.custom_guidance ?? undefined,
        categories: listCategoryKeys(),
        healthContext: survey.health_context ?? undefined,
      });
      await replaceSurveyQuestions(surveyId, scored);
      log.info({ questionCount: scored.length }, 'generated survey questions');
    }

    const result = await dispatchAnonymousSurveyBroadcast({
      surveyId,
      projectId: survey.project_id,
      cycleId: `manual-${surveyId}`,
      expiresAt: surveyLinkExpiryFromNow(),
      allowEmptyRoster: true,
    });
    if (!result) {
      log.info({ status: survey.status }, 'survey is not eligible for delivery');
      return;
    }
    log.info({ targetCount: result.targetCount, delivery: result.delivery }, 'shared survey broadcast completed');
  } catch (error) {
    await updateSurveyStatus(surveyId, 'failed', {
      analysisError: error instanceof Error ? error.message : 'Survey delivery failed',
    });
    throw error;
  }
}
