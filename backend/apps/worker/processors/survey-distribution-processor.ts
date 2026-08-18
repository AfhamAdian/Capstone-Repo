/**
 * Survey Distribution Processor
 *
 * Runs on an hourly tick (see worker.ts). Implements one shared monthly pulse
 * per project:
 *   - The send window opens on `SURVEY_MONTHLY_START_DAY`.
 *   - Each project is assigned its OWN randomized send moment somewhere inside
 *     the configured window, the first time this tick sees that window open
 *     for the project (persisted on the survey row so it's decided once, not
 *     re-rolled every tick).
 *   - Questions are generated `SURVEY_QUESTION_GEN_LEAD_DAYS` days before that
 *     project's send moment.
 *   - At the assigned moment, the survey auto-sends.
 * One anonymous shared link is stored on the survey row and broadcast once
 * to Slack/Telegram/Discord.
 */

import { logger } from '@libs/logger.js';
import { getAiClient } from '@libs/ai/index.js';
import { getAllProjectIds } from '../../api/database/project-member.js';
import {
  getOrCreateMonthlyPulse,
  replaceSurveyQuestions,
  getSurveyById,
  updateSurveyStatus,
  listDueForQuestionGeneration,
  listDueForSend,
  expireDueSurveys,
  listCategoryKeys,
  type SurveyRow,
} from '../../api/database/survey.js';
import { getProjectName } from '../../api/database/project.js';
import { captureSurveyHealthContext } from '../../api/database/project-health-score.js';
import { generateQualityQuestions } from '../../api/services/survey-question-generation.service.js';
import { dispatchAnonymousSurveyBroadcast } from '../../api/services/survey-dispatch.service.js';
import { periodMonthString } from '../../api/utils/period-month.js';
import { env } from '../../api/config/env.js';

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

/** Ensures this project's monthly auto-pulse survey exists and has questions. */
async function ensureSurveyWithQuestions(
  projectId: number,
  periodMonth: string,
  projectName: string,
  scheduledSendAt: Date,
): Promise<SurveyRow> {
  const healthContext = await captureSurveyHealthContext(projectId);
  const survey = await getOrCreateMonthlyPulse({
    projectId,
    periodMonth,
    trigger: 'Scheduled monthly pulse check',
    scheduledSendAt,
    healthContext,
  });
  if (survey.questions.length === 0) {
    try {
      const scored = await generateQualityQuestions({
        aiClient: getAiClient(),
        projectName,
        trigger: 'Scheduled monthly pulse check',
        categories: listCategoryKeys(),
        healthContext,
      });
      await replaceSurveyQuestions(survey.id, scored);
    } catch (error) {
      await updateSurveyStatus(survey.id, 'failed', {
        analysisError: error instanceof Error ? error.message : 'Question generation failed',
      });
      throw error;
    }
  }
  const refreshed = await getSurveyById(survey.id);
  if (!refreshed) throw new Error(`Survey ${survey.id} missing after question generation`);
  return refreshed;
}

/**
 * Step 1: assign monthly pulse rows before each send window opens so the
 * configured review lead time is real.
 */
async function assignDueSurveys(now: Date, projectIds: number[]): Promise<void> {
  const currentMonth = periodMonthString(now);
  const nextMonth = periodMonthString(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)));

  for (const periodMonth of [currentMonth, nextMonth]) {
    const { start, end } = windowRange(periodMonth, env.surveyMonthlyStartDay, env.surveyMonthlyWindowDays);
    const assignmentStart = addDays(start, -env.surveyQuestionGenLeadDays);
    if (now < assignmentStart || now > end) continue;
    const sendRangeStart = now > start ? now : start;
    for (const projectId of projectIds) {
      const healthContext = await captureSurveyHealthContext(projectId);
      await getOrCreateMonthlyPulse({
        projectId,
        periodMonth,
        trigger: 'Scheduled monthly pulse check',
        scheduledSendAt: randomWithin(sendRangeStart, end),
        healthContext,
      });
    }
  }
}

/** Step 2: generate questions for any pulse whose review lead time has arrived. */
async function processQuestionGeneration(now: Date): Promise<void> {
  const log = logger.child({ component: 'survey-distribution-processor', step: 'question-generation' });
  const due = await listDueForQuestionGeneration(now, env.surveyQuestionGenLeadDays);

  for (const survey of due) {
    try {
      const projectName = await getProjectName(survey.project_id);
      await ensureSurveyWithQuestions(
        survey.project_id,
        survey.period_month ?? periodMonthString(now),
        projectName,
        new Date(survey.scheduled_send_at ?? now),
      );
    } catch (error) {
      log.error({ error, surveyId: survey.id, projectId: survey.project_id }, 'failed to generate scheduled survey');
    }
  }
}

/** Step 3: dispatch when the scheduled send time arrives. */
async function processSend(now: Date): Promise<void> {
  const log = logger.child({ component: 'survey-distribution-processor', step: 'send' });
  const due = await listDueForSend(now);
  if (due.length === 0) return;

  for (const survey of due) {
    try {
      if (survey.source === 'manual') {
        await dispatchManualDraft(survey, now);
      } else {
        await dispatchMonthlyPulse(survey, now);
      }
    } catch (error) {
      await updateSurveyStatus(survey.id, 'failed', {
        analysisError: error instanceof Error ? error.message : 'Scheduled survey delivery failed',
      });
      log.error({ error, surveyId: survey.id, projectId: survey.project_id }, 'failed to dispatch scheduled survey');
    }
  }
}

async function dispatchManualDraft(survey: SurveyRow, now: Date): Promise<void> {
  if (survey.questions.length === 0) return;
  if (survey.status === 'paused' || survey.status === 'cancelled') return;
  if (survey.sent_at) return;

  const expiresAt = addDays(now, env.surveyResponseDeadlineDays);
  const result = await dispatchAnonymousSurveyBroadcast({
    surveyId: survey.id,
    projectId: survey.project_id,
    cycleId: `manual-${survey.id}`,
    expiresAt,
    allowEmptyRoster: true,
  });
  if (!result) return;

  logger
    .child({ component: 'survey-distribution-processor' })
    .info({ surveyId: survey.id, projectId: survey.project_id, targetCount: result.targetCount, at: now.toISOString() }, 'broadcast scheduled manual survey');
}

async function dispatchMonthlyPulse(survey: SurveyRow, now: Date): Promise<void> {
  const projectId = survey.project_id;
  const periodMonth = survey.period_month ?? periodMonthString(now);
  const monthKey = periodMonth.slice(0, 7);
  const projectName = await getProjectName(projectId);

  const ready = survey.questions.length > 0
    ? survey
    : await ensureSurveyWithQuestions(
      projectId,
      periodMonth,
      projectName,
      new Date(survey.scheduled_send_at ?? now),
    );
  if (ready.status === 'paused' || ready.status === 'cancelled') return;
  if (ready.sent_at) return;

  const sendAt = new Date(ready.scheduled_send_at ?? now);
  const expiresAt = addDays(sendAt, env.surveyResponseDeadlineDays);
  const result = await dispatchAnonymousSurveyBroadcast({
    surveyId: ready.id,
    projectId,
    cycleId: `auto-${projectId}-${monthKey}`,
    expiresAt,
  });
  if (!result) return;

  logger
    .child({ component: 'survey-distribution-processor' })
    .info({ projectId, targetCount: result.targetCount, at: now.toISOString() }, 'broadcast scheduled monthly pulse');
}

export async function processSurveyDistributionJob(): Promise<number[]> {
  const now = new Date();
  const projectIds = await getAllProjectIds();
  if (projectIds.length > 0) {
    await assignDueSurveys(now, projectIds);
    await processQuestionGeneration(now);
    await processSend(now);
  }
  return expireDueSurveys(now);
}
