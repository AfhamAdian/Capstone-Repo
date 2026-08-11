/**
 * Survey Send Processor
 * Handles a manual "Send Survey Now" job by minting one anonymous shared link
 * and broadcasting it once to Slack/Telegram/Discord. No recipient identity is
 * stored on the link and no direct messages or emails are sent.
 * The link stays open for env.surveyResponseDeadlineDays (customizable, 7-15 days).
 */

import type { SurveySendJobData } from '@libs/queue/index.js';
import { encodeToken } from '@libs/security/survey-token.js';
import { broadcastSurveyLink } from '@libs/notifications/index.js';
import { logger } from '@libs/logger.js';
import { env } from '../../api/config/env.js';
import {
  getSurveyById,
  setSurveyTargetCount,
  markSurveySent,
  claimSurveyForSend,
  updateSurveyStatus,
} from '../../api/database/survey.js';
import { countProjectMembers } from '../../api/database/project-member.js';
import { getProjectName } from '../../api/database/project.js';
import {
  createBundle,
  findBundleByCycle,
  markBundleNotified,
  getBundleById,
} from '../../api/database/survey-bundle.js';

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function buildSurveyUrl(token: string): string {
  const base = process.env.SURVEY_FORM_BASE_URL ?? 'http://localhost:5173/survey';
  return `${base}/${token}`;
}

export async function processSurveySendJob(jobData: SurveySendJobData): Promise<void> {
  const { surveyId } = jobData;
  const log = logger.child({ component: 'survey-send-processor', surveyId });
  const expiresAt = addDays(new Date(), env.surveyResponseDeadlineDays);

  const survey = await getSurveyById(surveyId);
  if (!survey) {
    log.error('survey not found, skipping send');
    return;
  }
  if (survey.status === 'cancelled') {
    log.info('survey was cancelled before dispatch');
    return;
  }

  const [targetCount, projectName] = await Promise.all([
    countProjectMembers(survey.project_id),
    getProjectName(survey.project_id),
  ]);

  if (targetCount === 0) {
    log.warn('project has no members, nothing to send');
    await updateSurveyStatus(surveyId, 'failed', { analysisError: 'no_project_members' });
    return;
  }
  const claimed = await claimSurveyForSend(surveyId);
  if (!claimed) {
    log.info({ status: survey.status }, 'survey is not eligible for delivery');
    return;
  }

  const cycleId = `manual-${surveyId}`;
  let bundle = await findBundleByCycle(cycleId);
  if (!bundle) {
    const bundleId = await createBundle({ surveyId, cycleId, expiresAt });
    bundle = await getBundleById(bundleId);
  }
  if (!bundle) throw new Error('Failed to create shared survey link');

  if (!bundle.notified_at) {
    const token = encodeToken({ bundleId: bundle.id, cycleId: bundle.cycle_id, deadline: bundle.expires_at });
    const delivery = await broadcastSurveyLink({
      url: buildSurveyUrl(token),
      projectNames: [projectName],
      deadline: new Date(bundle.expires_at),
    });
    if (!delivery.slackSent && !delivery.telegramSent && !delivery.discordSent) {
      throw new Error('Survey link was not delivered: configure at least one broadcast channel');
    }
    await markBundleNotified(bundle.id, delivery);
  }

  const sentAt = new Date();
  await setSurveyTargetCount(surveyId, targetCount);
  await markSurveySent(surveyId, sentAt);
  log.info({ targetCount }, 'shared survey broadcast completed');
}
