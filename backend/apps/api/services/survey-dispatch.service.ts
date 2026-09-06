/**
 * Shared survey-link dispatch used by both the hourly auto-pulse worker and
 * the manual "Send Survey Now" path. Mints one anonymous encrypted link,
 * broadcasts it once to Slack/Telegram/Discord, and marks the survey sent.
 */

import { encodeToken } from '@libs/security/survey-token.js';
import { broadcastSurveyLink } from '@libs/notifications/index.js';
import { logger } from '@libs/logger.js';
import { env } from '../config/env.js';
import {
  getSurveyById,
  setSurveyTargetCount,
  markSurveySent,
  claimSurveyForSend,
  updateSurveyStatus,
  markSurveyNotified,
  type SurveyDeliveryResults,
} from '../database/survey.js';
import {
  countProjectDevelopers,
  listProjectDeveloperUserIds,
  listProjectIdsForUser,
} from '../database/project-member.js';
import { getProjectName } from '../database/project.js';
import { findUsersByIds } from '../database/user.js';
import { sendSurveyEmail } from './email.service.js';
import {
  hasAnyRecipientRecordForSurvey,
  getSentCountsByProjectForUser,
  getLastSentAtForUser,
  recordSurveyRecipient,
} from '../database/survey-recipient.js';

const log = logger.child({ component: 'survey-dispatch' });

export interface DispatchSurveyInput {
  surveyId: number;
  projectId: number;
  cycleId: string;
  expiresAt: Date;
  /** When true, still broadcast even if the project has no members (testing). */
  allowEmptyRoster?: boolean;
}

export interface DispatchSurveyResult {
  url: string;
  targetCount: number;
  expiresAt: string;
  delivery: SurveyDeliveryResults;
}

export function buildSurveyUrl(token: string): string {
  return `${env.surveyFormBaseUrl}/${token}`;
}

export function publicSurveyUrlFor(survey: {
  id: number;
  cycle_id: string | null;
  expires_at: string | null;
}): string | null {
  if (!survey.cycle_id || !survey.expires_at) return null;
  const token = encodeToken({
    surveyId: survey.id,
    cycleId: survey.cycle_id,
    deadline: survey.expires_at,
  });
  return buildSurveyUrl(token);
}

/**
 * Emails each project developer the same anonymous link, skipping anyone who
 * already got a survey email (for any project) within SURVEY_MIN_DAYS_BETWEEN_SURVEYS,
 * and rotating fairly across a developer's projects so no single project can
 * monopolize a multi-project developer's attention (see the in-loop comment).
 * Runs once per survey (guarded by hasAnyRecipientRecordForSurvey).
 */
async function emailEligibleDevelopers(surveyId: number, projectId: number, url: string): Promise<void> {
  if (await hasAnyRecipientRecordForSurvey(surveyId)) return;

  const userIds = await listProjectDeveloperUserIds(projectId);
  if (userIds.length === 0) return;
  const developers = await findUsersByIds(userIds);

  const cooldownMs = env.surveyMinDaysBetweenSurveys * 24 * 60 * 60 * 1000;
  const now = new Date();

  for (const developer of developers) {
    // A developer working across more than one project must not have a single
    // project monopolize their attention. Rotate fairly: only skip this project
    // while it's already ahead of (has sent more than) some sibling project the
    // developer is also on - once every sibling has caught up, it's eligible
    // again. This is not a permanent block.
    const projectIds = await listProjectIdsForUser(developer.id);
    if (projectIds.length > 1) {
      const counts = await getSentCountsByProjectForUser(developer.id, projectIds);
      const thisCount = counts.get(projectId) ?? 0;
      const minOtherCount = Math.min(...projectIds.filter((id) => id !== projectId).map((id) => counts.get(id) ?? 0));
      if (thisCount > minOtherCount) {
        await recordSurveyRecipient({
          surveyId, projectId, userId: developer.id, email: developer.email,
          status: 'skipped', skipReason: 'rotation_wait_for_other_projects',
        });
        continue;
      }
    }

    const lastSentAt = await getLastSentAtForUser(developer.id);
    if (lastSentAt && now.getTime() - lastSentAt.getTime() < cooldownMs) {
      await recordSurveyRecipient({
        surveyId, projectId, userId: developer.id, email: developer.email,
        status: 'skipped', skipReason: 'cooldown_active',
      });
      continue;
    }
    try {
      await sendSurveyEmail(developer.email, developer.name, url);
      await recordSurveyRecipient({
        surveyId, projectId, userId: developer.id, email: developer.email,
        status: 'sent', sentAt: now,
      });
    } catch (error) {
      await recordSurveyRecipient({
        surveyId, projectId, userId: developer.id, email: developer.email,
        status: 'failed', skipReason: error instanceof Error ? error.message.slice(0, 200) : 'send failed',
      });
    }
  }
}

export async function dispatchAnonymousSurveyBroadcast(
  input: DispatchSurveyInput,
): Promise<DispatchSurveyResult | null> {
  const survey = await getSurveyById(input.surveyId);
  if (!survey) return null;
  if (survey.status === 'cancelled' || survey.status === 'paused') return null;
  if (survey.sent_at) return null;

  const [developerCount, projectName] = await Promise.all([
    countProjectDevelopers(input.projectId),
    getProjectName(input.projectId),
  ]);

  if (developerCount === 0 && !input.allowEmptyRoster) {
    await updateSurveyStatus(input.surveyId, 'failed', { analysisError: 'no_project_developers' });
    return null;
  }

  const claimed = await claimSurveyForSend(input.surveyId, input.cycleId, input.expiresAt);
  if (!claimed) return null;

  const claimedSurvey = await getSurveyById(input.surveyId);
  if (!claimedSurvey?.cycle_id || !claimedSurvey.expires_at) {
    throw new Error('Failed to claim shared survey link');
  }

  const url = publicSurveyUrlFor(claimedSurvey);
  if (!url) {
    throw new Error('Failed to mint shared survey link');
  }

  let delivery: SurveyDeliveryResults = claimedSurvey.delivery ?? {};

  if (!claimedSurvey.notified_at) {
    delivery = await broadcastSurveyLink({
      url,
      projectNames: [projectName],
      deadline: new Date(claimedSurvey.expires_at),
    });
    if (!delivery.slackSent && !delivery.telegramSent && !delivery.discordSent) {
      throw new Error('Survey link was not delivered: configure at least one broadcast channel');
    }
    await markSurveyNotified(claimedSurvey.id, delivery);
  }

  try {
    await emailEligibleDevelopers(claimedSurvey.id, input.projectId, url);
  } catch (error) {
    log.error({ err: error, surveyId: claimedSurvey.id }, 'per-developer survey email dispatch failed');
  }

  const targetCount = developerCount;
  await setSurveyTargetCount(input.surveyId, targetCount);
  await markSurveySent(input.surveyId, new Date());

  return {
    url,
    targetCount,
    expiresAt: claimedSurvey.expires_at,
    delivery,
  };
}

export function surveyLinkExpiryFromNow(): Date {
  return new Date(Date.now() + env.surveyResponseDeadlineDays * 24 * 60 * 60 * 1000);
}
