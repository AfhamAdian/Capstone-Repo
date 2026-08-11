/**
 * Survey Distribution Processor
 *
 * Runs on an hourly tick (see worker.ts). Implements one shared monthly pulse
 * per project:
 *   - The send window opens on `SURVEY_MONTHLY_START_DAY`.
 *   - Each project is assigned its OWN randomized send moment somewhere inside
 *     the configured window, the first time this
 *     tick sees that window open for the project (persisted in `surveyschedule`
 *     so it's decided once, not re-rolled every tick) - so projects don't all
 *     fire in the same instant.
 *   - Questions are generated `SURVEY_QUESTION_GEN_LEAD_DAYS` days before that
 *     project's send moment, with no approval gate - editing IS the review step
 *     (see survey.service.ts::editQuestions), open to level-1 users right up
 *     until someone submits a response.
 *   - At the assigned moment, the survey auto-sends - no manual trigger needed.
 * One anonymous shared link is created per project/month and broadcast once
 * to Slack/Telegram/Discord. No recipient identity is stored on the link.
 * The link stays open for env.surveyResponseDeadlineDays (customizable, 7-15 days).
 */

import { logger } from '@libs/logger.js';
import { encodeToken } from '@libs/security/survey-token.js';
import { broadcastSurveyLink } from '@libs/notifications/index.js';
import { getAiClient } from '@libs/ai/index.js';
import { getAllProjectIds, countProjectMembers } from '../../api/database/project-member.js';
import {
  findOrCreateAutoPulseSurvey,
  setSurveyTargetCount,
  getQuestionsForSurveys,
  addSurveyQuestions,
  markSurveySent,
  setSurveyReviewWindow,
  getSurveyById,
  updateSurveyStatus,
  claimSurveyForSend,
} from '../../api/database/survey.js';
import { listCategoryKeys } from '../../api/database/survey-category.js';
import { getProjectName } from '../../api/database/project.js';
import { captureSurveyHealthContext } from '../../api/database/project-health-score.js';
import { generateQualityQuestions } from '../../api/services/survey-question-generation.service.js';
import { periodMonthString } from '../../api/utils/period-month.js';
import { env } from '../../api/config/env.js';
import {
  createBundle,
  findBundleByCycle,
  markBundleNotified,
  getBundleById,
  expireDueBundles,
  type SurveyBundleRow,
} from '../../api/database/survey-bundle.js';
import {
  getOrCreateSchedule,
  listDueForQuestionGeneration,
  listDueForSend,
  markQuestionsGenerated,
  markScheduleSent,
  type SurveyScheduleRow,
} from '../../api/database/survey-schedule.js';

function windowRange(periodMonth: string, startDay: number, windowDays: number): { start: Date; end: Date } {
  const [year, month] = periodMonth.split('-').map(Number) as [number, number];
  const start = new Date(Date.UTC(year, month - 1, startDay, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, startDay + windowDays - 1, 23, 59, 59));
  return { start, end };
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

/** Ensures this project's monthly auto-pulse survey exists and has questions. */
async function ensureSurveyWithQuestions(
  projectId: number,
  periodMonth: string,
  projectName: string,
  scheduledSendAt: Date,
): Promise<number> {
  const healthContext = await captureSurveyHealthContext(projectId);
  const surveyId = await findOrCreateAutoPulseSurvey(
    projectId,
    periodMonth,
    'Scheduled monthly pulse check',
    healthContext,
  );
  const existingQuestions = await getQuestionsForSurveys([surveyId]);
  if (existingQuestions.length === 0) {
    try {
      const categories = await listCategoryKeys();
      const scored = await generateQualityQuestions({
        aiClient: getAiClient(),
        projectName,
        trigger: 'Scheduled monthly pulse check',
        categories,
        healthContext,
      });
      await addSurveyQuestions(surveyId, scored);
    } catch (error) {
      await updateSurveyStatus(surveyId, 'failed', {
        analysisError: error instanceof Error ? error.message : 'Question generation failed',
      });
      throw error;
    }
  }
  await setSurveyReviewWindow(surveyId, scheduledSendAt);
  return surveyId;
}

/**
 * Step 1: assign schedules before each send window opens so the configured
 * review lead time is real. A start-day of 1 can therefore be prepared in the final
 * days of the previous month.
 */
async function assignDueSchedules(now: Date, projectIds: number[]): Promise<void> {
  const currentMonth = periodMonthString(now);
  const nextMonth = periodMonthString(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)));

  for (const periodMonth of [currentMonth, nextMonth]) {
    const { start, end } = windowRange(periodMonth, env.surveyMonthlyStartDay, env.surveyMonthlyWindowDays);
    const assignmentStart = addDays(start, -env.surveyQuestionGenLeadDays);
    if (now < assignmentStart || now > end) continue;
    const sendRangeStart = now > start ? now : start;
    for (const projectId of projectIds) {
      await getOrCreateSchedule(projectId, periodMonth, randomWithin(sendRangeStart, end));
    }
  }
}

/** Step 2: generate questions for any project whose review lead time has arrived. */
async function processQuestionGeneration(now: Date): Promise<void> {
  const log = logger.child({ component: 'survey-distribution-processor', step: 'question-generation' });
  const due = await listDueForQuestionGeneration(now, env.surveyQuestionGenLeadDays);

  for (const schedule of due) {
    try {
      const projectName = await getProjectName(schedule.project_id);
      const surveyId = await ensureSurveyWithQuestions(
        schedule.project_id,
        schedule.period_month,
        projectName,
        new Date(schedule.scheduled_send_at),
      );
      await markQuestionsGenerated(schedule.id, surveyId);
    } catch (error) {
      log.error({ error, scheduleId: schedule.id, projectId: schedule.project_id }, 'failed to generate scheduled survey');
    }
  }
}

/** Resolves the one shared link for this project/month. */
async function resolveBundle(
  surveyId: number,
  projectId: number,
  monthKey: string,
  expiresAt: Date,
): Promise<SurveyBundleRow> {
  const cycleId = `auto-${projectId}-${monthKey}`;
  const existing = await findBundleByCycle(cycleId);
  if (existing) return existing;
  const bundleId = await createBundle({ surveyId, cycleId, expiresAt });
  const bundle = await getBundleById(bundleId);
  if (!bundle) throw new Error(`Survey link ${bundleId} vanished immediately after creation`);
  return bundle;
}

/** Step 3: dispatch after the review window when the monthly send time arrives. */
async function processSend(now: Date): Promise<void> {
  const log = logger.child({ component: 'survey-distribution-processor', step: 'send' });
  const due = await listDueForSend(now);
  if (due.length === 0) return;

  for (const schedule of due) {
    try {
      await dispatchScheduleRound(schedule, now);
    } catch (error) {
      if (schedule.survey_id) {
        await updateSurveyStatus(schedule.survey_id, 'failed', {
          analysisError: error instanceof Error ? error.message : 'Scheduled survey delivery failed',
        });
      }
      log.error({ error, scheduleId: schedule.id, projectId: schedule.project_id }, 'failed to dispatch scheduled survey');
    }
  }
}

async function dispatchScheduleRound(schedule: SurveyScheduleRow, now: Date): Promise<void> {
  const { project_id: projectId, period_month: periodMonth } = schedule;
  const monthKey = periodMonth.slice(0, 7);
  const projectName = await getProjectName(projectId);

  // Safety net: if the gen step hasn't run yet for this schedule (e.g. LEAD_DAYS=0
  // or a missed tick), ensure the survey/questions exist before sending anyway.
  const surveyId = schedule.survey_id ?? (
    await ensureSurveyWithQuestions(projectId, periodMonth, projectName, new Date(schedule.scheduled_send_at))
  );
  const survey = await getSurveyById(surveyId);
  if (!survey) throw new Error(`Survey ${surveyId} not found for schedule ${schedule.id}`);
  if (survey.status === 'paused') return;
  if (survey.status === 'cancelled') {
    await markScheduleSent(schedule.id);
    return;
  }
  if (survey.sent_at) {
    await markScheduleSent(schedule.id);
    return;
  }
  if (!(await claimSurveyForSend(surveyId))) return;

  const targetCount = await countProjectMembers(projectId);
  if (targetCount === 0) {
    await updateSurveyStatus(surveyId, 'failed', { analysisError: 'no_project_members' });
    await markScheduleSent(schedule.id);
    return;
  }

  const expiresAt = addDays(new Date(schedule.scheduled_send_at), env.surveyResponseDeadlineDays);
  const bundle = await resolveBundle(surveyId, projectId, monthKey, expiresAt);
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

  await setSurveyTargetCount(surveyId, targetCount);
  await markSurveySent(surveyId, now);
  await markScheduleSent(schedule.id);

  logger
    .child({ component: 'survey-distribution-processor' })
    .info({ projectId, targetCount }, 'broadcast scheduled monthly pulse');
}

export async function processSurveyDistributionJob(): Promise<number[]> {
  const now = new Date();
  const projectIds = await getAllProjectIds();
  if (projectIds.length > 0) {
    await assignDueSchedules(now, projectIds);
    await processQuestionGeneration(now);
    await processSend(now);
  }
  return closeExpiredSurveys(now);
}

async function closeExpiredSurveys(now: Date): Promise<number[]> {
  const surveyIds = await expireDueBundles(now);
  const closed: number[] = [];
  for (const surveyId of surveyIds) {
    const survey = await getSurveyById(surveyId);
    if (!survey || survey.status !== 'active') continue;
    await updateSurveyStatus(surveyId, 'closed', {
      closedAt: now,
      closeReason: 'deadline',
    });
    closed.push(surveyId);
  }
  return closed;
}
