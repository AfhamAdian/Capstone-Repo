/**
 * Survey Distribution Processor
 *
 * Runs on an hourly tick (see worker.ts). Implements the two-round, 50/50,
 * per-project-staggered monthly rollout:
 *   - Round 1 opens on day `SURVEY_ROUND1_START_DAY`, round 2 on `..._ROUND2_...`.
 *   - Each project is assigned its OWN randomized send moment somewhere inside
 *     that round's `SURVEY_ROUND_WINDOW_DAYS`-day window, the first time this
 *     tick sees that window open for the project (persisted in `surveyschedule`
 *     so it's decided once, not re-rolled every tick) - so projects don't all
 *     fire in the same instant.
 *   - Questions are generated `SURVEY_QUESTION_GEN_LEAD_DAYS` days before that
 *     project's send moment, with no approval gate - editing IS the review step
 *     (see survey.service.ts::editQuestions), open to level-1 users right up
 *     until someone submits a response.
 *   - At the assigned moment, the survey auto-sends - no manual trigger needed.
 *   - Each developer receives AT MOST ONE survey per calendar month, enforced
 *     GLOBALLY across all of their project memberships (see
 *     project-member.ts::getLastSurveyedAtByUser), so a multi-project developer
 *     is never double-surveyed even though projects run on independent clocks.
 *
 * Link model: governed by SURVEY_LINK_MODE (see @libs/security/survey-link).
 *   - 'shared' (default): ONE anonymous link per project per round, reused by
 *     that round's cohort. The bundle carries no user_id.
 *   - 'single_use': one per-developer link, atomically consumed on submit.
 */

import { logger } from '@libs/logger.js';
import { encodeToken } from '@libs/security/survey-token.js';
import { getSurveyLinkMode, isSingleUse, type SurveyLinkMode } from '@libs/security/survey-link.js';
import { notifySurveyRecipient, broadcastSurveyLink } from '@libs/notifications/index.js';
import { getAiClient } from '@libs/ai/index.js';
import {
  getAllProjectIds,
  getEligibleMembersForAutoPulse,
  updateLastSurveySentAt,
  type ProjectMemberWithUser,
} from '../../api/database/project-member.js';
import {
  findOrCreateAutoPulseSurvey,
  incrementSurveyTargetCount,
  getQuestionsForSurveys,
  addSurveyQuestions,
  markFirstSentAtIfAbsent,
} from '../../api/database/survey.js';
import { listCategoryKeys } from '../../api/database/survey-category.js';
import { getProjectName } from '../../api/database/project.js';
import { generateQualityQuestions } from '../../api/services/survey-question-generation.service.js';
import { periodMonthString } from '../../api/utils/period-month.js';
import { selectRoundParticipants } from './survey-round-selection.js';
import { env } from '../../api/config/env.js';
import {
  createBundle,
  linkSurveyToBundleIfAbsent,
  findSharedBundleByCycle,
  markBundleNotified,
  getBundleById,
  type SurveyBundleRow,
} from '../../api/database/survey-bundle.js';
import {
  getOrCreateSchedule,
  listDueForQuestionGeneration,
  listDueForSend,
  markQuestionsGenerated,
  markScheduleSent,
  type SurveyRound,
  type SurveyScheduleRow,
} from '../../api/database/survey-schedule.js';

const ROUNDS: { round: SurveyRound; startDay: number }[] = [
  { round: 1, startDay: env.surveyRound1StartDay },
  { round: 2, startDay: env.surveyRound2StartDay },
];

function windowRange(periodMonth: string, startDay: number, windowDays: number): { start: Date; end: Date } {
  const [year, month] = periodMonth.split('-').map(Number) as [number, number];
  const start = new Date(Date.UTC(year, month - 1, startDay, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, startDay + windowDays - 1, 23, 59, 59));
  return { start, end };
}

function isWithinWindow(now: Date, startDay: number, windowDays: number): boolean {
  const day = now.getUTCDate();
  return day >= startDay && day <= startDay + windowDays - 1;
}

function randomWithin(start: Date, end: Date): Date {
  const t = start.getTime() + Math.random() * (end.getTime() - start.getTime());
  return new Date(t);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function buildSurveyUrl(token: string): string {
  const base = process.env.SURVEY_FORM_BASE_URL ?? 'http://localhost:5173/survey';
  return `${base}/${token}`;
}

/** Ensures this project's monthly auto-pulse survey row exists and has questions (generated once - later calls are a no-op if questions already exist, so round 2 reusing the same survey never re-generates or duplicates). */
async function ensureSurveyWithQuestions(projectId: number, periodMonth: string, projectName: string): Promise<number> {
  const surveyId = await findOrCreateAutoPulseSurvey(projectId, periodMonth, 'Scheduled monthly pulse check');
  const existingQuestions = await getQuestionsForSurveys([surveyId]);
  if (existingQuestions.length === 0) {
    const categories = await listCategoryKeys();
    const scored = await generateQualityQuestions({
      aiClient: getAiClient(),
      projectName,
      trigger: 'Scheduled monthly pulse check',
      categories,
    });
    if (scored.length > 0) await addSurveyQuestions(surveyId, scored);
  }
  return surveyId;
}

/** Step 1: for each project whose round window is currently open, assign (once) a randomized send moment within that window. */
async function assignDueSchedules(now: Date, periodMonth: string, projectIds: number[]): Promise<void> {
  for (const { round, startDay } of ROUNDS) {
    if (!isWithinWindow(now, startDay, env.surveyRoundWindowDays)) continue;
    const { start, end } = windowRange(periodMonth, startDay, env.surveyRoundWindowDays);
    for (const projectId of projectIds) {
      await getOrCreateSchedule(projectId, periodMonth, round, randomWithin(start, end));
    }
  }
}

/** Step 2: generate questions for any project/round whose lead time has arrived. */
async function processQuestionGeneration(now: Date): Promise<void> {
  const log = logger.child({ component: 'survey-distribution-processor', step: 'question-generation' });
  const due = await listDueForQuestionGeneration(now, env.surveyQuestionGenLeadDays);

  for (const schedule of due) {
    try {
      const projectName = await getProjectName(schedule.project_id);
      const surveyId = await ensureSurveyWithQuestions(schedule.project_id, schedule.period_month, projectName);
      await markQuestionsGenerated(schedule.id, surveyId);
    } catch (error) {
      log.error({ error, scheduleId: schedule.id, projectId: schedule.project_id }, 'failed to generate questions for scheduled round');
    }
  }
}

/** Resolves the bundle recipients for this project/round should be linked to, per the active link mode. */
async function resolveBundle(
  mode: SurveyLinkMode,
  projectId: number,
  monthKey: string,
  round: SurveyRound,
  userId: number | null,
  expiresAt: Date,
): Promise<SurveyBundleRow> {
  if (isSingleUse(mode)) {
    if (userId === null) throw new Error('resolveBundle: userId is required in single_use mode');
    const bundleId = await createBundle({
      userId,
      cycleId: `auto-${projectId}-${monthKey}-r${round}-u${userId}`,
      expiresAt,
      mode,
    });
    const bundle = await getBundleById(bundleId);
    if (!bundle) throw new Error(`Bundle ${bundleId} vanished immediately after creation`);
    return bundle;
  }

  const cycleId = `auto-${projectId}-${monthKey}-r${round}`;
  const existing = await findSharedBundleByCycle(cycleId);
  if (existing) return existing;
  const bundleId = await createBundle({ userId: null, cycleId, expiresAt, mode });
  const bundle = await getBundleById(bundleId);
  if (!bundle) throw new Error(`Shared bundle ${bundleId} vanished immediately after creation`);
  return bundle;
}

/** Step 3: dispatch (auto-send, no approval) for any project/round whose send moment has arrived. */
async function processSend(now: Date): Promise<void> {
  const log = logger.child({ component: 'survey-distribution-processor', step: 'send' });
  const due = await listDueForSend(now);
  if (due.length === 0) return;

  const mode = getSurveyLinkMode();

  for (const schedule of due) {
    try {
      await dispatchScheduleRound(schedule, now, mode);
    } catch (error) {
      log.error({ error, scheduleId: schedule.id, projectId: schedule.project_id }, 'failed to dispatch scheduled round');
    }
  }
}

async function dispatchScheduleRound(schedule: SurveyScheduleRow, now: Date, mode: SurveyLinkMode): Promise<void> {
  const { project_id: projectId, period_month: periodMonth, round } = schedule;
  const monthKey = periodMonth.slice(0, 7);
  const projectName = await getProjectName(projectId);

  // Safety net: if the gen step hasn't run yet for this schedule (e.g. LEAD_DAYS=0
  // or a missed tick), ensure the survey/questions exist before sending anyway.
  const surveyId = schedule.survey_id ?? (await ensureSurveyWithQuestions(projectId, periodMonth, projectName));

  const eligible = await getEligibleMembersForAutoPulse(projectId, now);
  const selected: ProjectMemberWithUser[] = selectRoundParticipants(eligible, round);

  if (selected.length === 0) {
    await markScheduleSent(schedule.id);
    return;
  }

  const expiresAt = addDays(new Date(schedule.scheduled_send_at), 7);
  let sharedBundle: SurveyBundleRow | null = null;
  if (!isSingleUse(mode)) {
    sharedBundle = await resolveBundle(mode, projectId, monthKey, round, null, expiresAt);
    await linkSurveyToBundleIfAbsent(sharedBundle.id, surveyId, null);
  }

  for (const member of selected) {
    try {
      const bundle = isSingleUse(mode)
        ? await resolveBundle(mode, projectId, monthKey, round, member.userId, expiresAt)
        : sharedBundle!;
      if (isSingleUse(mode)) {
        await linkSurveyToBundleIfAbsent(bundle.id, surveyId, member.projectMemberId);
      }

      await incrementSurveyTargetCount(surveyId, 1);
      await updateLastSurveySentAt(member.projectMemberId, now);

      if (member.email) {
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
      }
    } catch (error) {
      logger.child({ component: 'survey-distribution-processor' }).error({ error, userId: member.userId }, 'failed to notify member');
    }
  }

  if (sharedBundle && !isSingleUse(mode)) {
    const token = encodeToken({ bundleId: sharedBundle.id, cycleId: sharedBundle.cycle_id, deadline: sharedBundle.expires_at });
    await broadcastSurveyLink({
      url: buildSurveyUrl(token),
      projectNames: [projectName],
      deadline: new Date(sharedBundle.expires_at),
    });
    await markBundleNotified(sharedBundle.id);
  }

  await markFirstSentAtIfAbsent(surveyId);
  await markScheduleSent(schedule.id);

  logger
    .child({ component: 'survey-distribution-processor' })
    .info({ projectId, round, selected: selected.length, mode }, 'dispatched scheduled auto-pulse round');
}

export async function processSurveyDistributionJob(): Promise<void> {
  const now = new Date();
  const periodMonth = periodMonthString(now);

  const projectIds = await getAllProjectIds();
  if (projectIds.length === 0) return;

  await assignDueSchedules(now, periodMonth, projectIds);
  await processQuestionGeneration(now);
  await processSend(now);
}
