import { assertSupabaseClient } from '../config/supabase.js';

export interface SurveyScheduleRow {
  id: number;
  project_id: number;
  period_month: string;
  scheduled_send_at: string;
  survey_id: number | null;
  questions_generated_at: string | null;
  sent_at: string | null;
  created_at: string;
}

/**
 * Creates this project's monthly schedule if it doesn't exist yet,
 * assigning a randomized `scheduledSendAt` within the round's window (the
 * caller computes the window/offset - this just persists it idempotently so
 * concurrent job ticks don't double-assign). Returns the existing row if one
 * was already created (the random timestamp is decided once, at first creation).
 */
export async function getOrCreateSchedule(
  projectId: number,
  periodMonth: string,
  scheduledSendAt: Date,
): Promise<SurveyScheduleRow> {
  const client = assertSupabaseClient();

  const { data: existing, error: findError } = await client
    .from('surveyschedule')
    .select('*')
    .eq('project_id', projectId)
    .eq('period_month', periodMonth)
    .maybeSingle();
  if (findError) {
    throw new Error(`Failed to look up survey schedule: ${findError.message}`);
  }
  if (existing) return existing as SurveyScheduleRow;

  const { data: created, error: insertError } = await client
    .from('surveyschedule')
    .insert([{ project_id: projectId, period_month: periodMonth, scheduled_send_at: scheduledSendAt.toISOString() }])
    .select('*')
    .single();
  if (insertError || !created) {
    // Unique constraint race: another tick created it first - re-fetch instead of failing.
    const { data: refetched, error: refetchError } = await client
      .from('surveyschedule')
      .select('*')
      .eq('project_id', projectId)
      .eq('period_month', periodMonth)
      .maybeSingle();
    if (refetchError || !refetched) {
      throw new Error(`Failed to create survey schedule: ${insertError?.message ?? 'unknown error'}`);
    }
    return refetched as SurveyScheduleRow;
  }
  return created as SurveyScheduleRow;
}

/** Schedule rows whose question-generation lead time has arrived but questions haven't been generated yet. */
export async function listDueForQuestionGeneration(now: Date, leadDays: number): Promise<SurveyScheduleRow[]> {
  const client = assertSupabaseClient();
  const threshold = new Date(now.getTime() + leadDays * 24 * 60 * 60 * 1000);

  const { data, error } = await client
    .from('surveyschedule')
    .select('*')
    .is('questions_generated_at', null)
    .lte('scheduled_send_at', threshold.toISOString());
  if (error) {
    throw new Error(`Failed to list schedules due for question generation: ${error.message}`);
  }
  return (data as SurveyScheduleRow[]) ?? [];
}

/** Schedule rows whose send time has arrived but haven't been dispatched yet. */
export async function listDueForSend(now: Date): Promise<SurveyScheduleRow[]> {
  const client = assertSupabaseClient();

  const { data, error } = await client
    .from('surveyschedule')
    .select('*')
    .is('sent_at', null)
    .lte('scheduled_send_at', now.toISOString());
  if (error) {
    throw new Error(`Failed to list schedules due for send: ${error.message}`);
  }
  return (data as SurveyScheduleRow[]) ?? [];
}

export async function markQuestionsGenerated(scheduleId: number, surveyId: number): Promise<void> {
  const client = assertSupabaseClient();
  const { error } = await client
    .from('surveyschedule')
    .update({ questions_generated_at: new Date().toISOString(), survey_id: surveyId })
    .eq('id', scheduleId);
  if (error) {
    throw new Error(`Failed to mark schedule ${scheduleId} questions generated: ${error.message}`);
  }
}

/** All schedule rows for a project, optionally filtered to one period_month. Used by the admin-facing schedule-status endpoint. */
export async function listSchedulesForProject(projectId: number, periodMonth?: string): Promise<SurveyScheduleRow[]> {
  const client = assertSupabaseClient();
  let query = client
    .from('surveyschedule')
    .select('*')
    .eq('project_id', projectId)
    .order('period_month', { ascending: false });
  if (periodMonth) query = query.eq('period_month', periodMonth);

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list schedules for project ${projectId}: ${error.message}`);
  }
  return (data as SurveyScheduleRow[]) ?? [];
}

export async function markScheduleSent(scheduleId: number): Promise<void> {
  const client = assertSupabaseClient();
  const { error } = await client.from('surveyschedule').update({ sent_at: new Date().toISOString() }).eq('id', scheduleId);
  if (error) {
    throw new Error(`Failed to mark schedule ${scheduleId} sent: ${error.message}`);
  }
}
