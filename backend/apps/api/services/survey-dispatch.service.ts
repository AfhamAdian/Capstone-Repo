/**
 * Shared survey-link dispatch used by both the hourly auto-pulse worker and
 * the manual "Send Survey Now" path. Mints one anonymous encrypted link,
 * broadcasts it once to Slack/Telegram/Discord, and marks the survey sent.
 */

import { encodeToken } from '@libs/security/survey-token.js';
import { broadcastSurveyLink } from '@libs/notifications/index.js';
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
import { countProjectMembers } from '../database/project-member.js';
import { getProjectName } from '../database/project.js';

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
  const base = process.env.SURVEY_FORM_BASE_URL ?? 'http://localhost:5173/survey';
  return `${base.replace(/\/$/, '')}/${token}`;
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

export async function dispatchAnonymousSurveyBroadcast(
  input: DispatchSurveyInput,
): Promise<DispatchSurveyResult | null> {
  const survey = await getSurveyById(input.surveyId);
  if (!survey) return null;
  if (survey.status === 'cancelled' || survey.status === 'paused') return null;
  if (survey.sent_at) return null;

  const [memberCount, projectName] = await Promise.all([
    countProjectMembers(input.projectId),
    getProjectName(input.projectId),
  ]);

  if (memberCount === 0 && !input.allowEmptyRoster) {
    await updateSurveyStatus(input.surveyId, 'failed', { analysisError: 'no_project_members' });
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

  const targetCount =
    claimedSurvey.target_count > 0 ? claimedSurvey.target_count : Math.max(memberCount, 1);
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
