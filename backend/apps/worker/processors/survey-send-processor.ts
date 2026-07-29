/**
 * Survey Send Processor
 * Handles a manual "Send Survey Now" job. Honors SURVEY_LINK_MODE:
 *   - 'shared' (default): mints ONE anonymous link for the whole project, emails
 *     every member the same link, and broadcasts it once to Telegram/Discord.
 *   - 'single_use': mints one per-developer link, consumed atomically on submit.
 * Either way, recipients' last_survey_sent_at is stamped so the auto-pulse
 * distribution won't also survey them this month (one survey per developer/month).
 */

import type { SurveySendJobData } from '@libs/queue/index.js';
import { encodeToken } from '@libs/security/survey-token.js';
import { getSurveyLinkMode, isSingleUse } from '@libs/security/survey-link.js';
import { notifySurveyRecipient, broadcastSurveyLink } from '@libs/notifications/index.js';
import { logger } from '@libs/logger.js';
import {
  getSurveyById,
  updateSurveyStatus,
  incrementSurveyTargetCount,
  markFirstSentAtIfAbsent,
} from '../../api/database/survey.js';
import { getProjectMembersWithUser, updateLastSurveySentAt } from '../../api/database/project-member.js';
import { getProjectName } from '../../api/database/project.js';
import {
  createBundle,
  linkSurveyToBundleIfAbsent,
  findSharedBundleByCycle,
  markBundleNotified,
  getBundleById,
  type SurveyBundleRow,
} from '../../api/database/survey-bundle.js';

const LINK_EXPIRY_DAYS = 7;

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
  const mode = getSurveyLinkMode();
  const expiresAt = addDays(new Date(), LINK_EXPIRY_DAYS);

  const survey = await getSurveyById(surveyId);
  if (!survey) {
    log.error('survey not found, skipping send');
    return;
  }

  const [members, projectName] = await Promise.all([
    getProjectMembersWithUser(survey.project_id),
    getProjectName(survey.project_id),
  ]);

  if (members.length === 0) {
    log.warn('project has no members, nothing to send');
    return;
  }

  // In shared mode a single bundle serves the whole project cohort.
  let sharedBundle: SurveyBundleRow | null = null;
  if (!isSingleUse(mode)) {
    const cycleId = `manual-${surveyId}`;
    sharedBundle = await findSharedBundleByCycle(cycleId);
    if (!sharedBundle) {
      const bundleId = await createBundle({ userId: null, cycleId, expiresAt, mode });
      sharedBundle = await getBundleById(bundleId);
    }
    if (!sharedBundle) throw new Error('Failed to create shared bundle for manual send');
    await linkSurveyToBundleIfAbsent(sharedBundle.id, surveyId, null);
  }

  let sentCount = 0;

  for (const member of members) {
    try {
      let bundle: SurveyBundleRow;
      if (isSingleUse(mode)) {
        const bundleId = await createBundle({ userId: member.userId, cycleId: `manual-${surveyId}-u${member.userId}`, expiresAt, mode });
        const created = await getBundleById(bundleId);
        if (!created) throw new Error(`Bundle ${bundleId} vanished immediately after creation`);
        bundle = created;
        await linkSurveyToBundleIfAbsent(bundle.id, surveyId, member.projectMemberId);
      } else {
        bundle = sharedBundle!;
      }

      // Stamp the monthly cap regardless of channel success so auto-pulse skips them this month.
      await updateLastSurveySentAt(member.projectMemberId, new Date());

      if (!member.email) {
        log.warn({ projectMemberId: member.projectMemberId }, 'member has no email on file, skipping notification');
        continue;
      }

      const token = encodeToken({ bundleId: bundle.id, cycleId: bundle.cycle_id, deadline: bundle.expires_at });
      await notifySurveyRecipient({
        recipientEmail: member.email,
        recipientName: member.name,
        recipientDiscordUserId: member.discordUserId,
        url: buildSurveyUrl(token),
        projectNames: [projectName],
        deadline: new Date(bundle.expires_at),
      });
      if (isSingleUse(mode)) await markBundleNotified(bundle.id);
      sentCount += 1;
    } catch (error) {
      log.error({ error, projectMemberId: member.projectMemberId }, 'failed to send survey to member');
    }
  }

  // One team-wide broadcast of the shared link (never in single-use mode).
  if (sharedBundle && !isSingleUse(mode)) {
    const token = encodeToken({ bundleId: sharedBundle.id, cycleId: sharedBundle.cycle_id, deadline: sharedBundle.expires_at });
    await broadcastSurveyLink({
      url: buildSurveyUrl(token),
      projectNames: [projectName],
      deadline: new Date(sharedBundle.expires_at),
    });
    await markBundleNotified(sharedBundle.id);
  }

  await incrementSurveyTargetCount(surveyId, sentCount);
  await updateSurveyStatus(surveyId, 'active');
  await markFirstSentAtIfAbsent(surveyId);
  log.info({ sentCount, totalMembers: members.length, mode }, 'survey send job completed');
}
