import { assertSupabaseClient } from '../config/supabase.js';
import { insertRow } from './supabase-write.js';

export type SurveyRecipientStatus = 'sent' | 'skipped' | 'failed';

export interface RecordSurveyRecipientInput {
  surveyId: number;
  projectId: number;
  userId: number;
  email: string;
  status: SurveyRecipientStatus;
  skipReason?: string;
  sentAt?: Date;
}

/** True once this survey has any recipient rows — idempotency gate so a retried send job doesn't re-email everyone. */
export async function hasAnyRecipientRecordForSurvey(surveyId: number): Promise<boolean> {
  const client = assertSupabaseClient();
  const { count, error } = await client
    .from('survey_recipient')
    .select('id', { count: 'exact', head: true })
    .eq('survey_id', surveyId);
  if (error) throw new Error(`Failed to check survey_recipient for survey ${surveyId}: ${error.message}`);
  return (count ?? 0) > 0;
}

/**
 * How many surveys this developer has ever been successfully emailed, per project
 * (restricted to the given project IDs). Used to keep multi-project survey emails
 * rotating fairly - a project is only skipped while it's ahead of a sibling project
 * the developer is also on, never permanently.
 */
export async function getSentCountsByProjectForUser(userId: number, projectIds: number[]): Promise<Map<number, number>> {
  const counts = new Map<number, number>(projectIds.map((id) => [id, 0]));
  if (projectIds.length === 0) return counts;

  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('survey_recipient')
    .select('project_id')
    .eq('user_id', userId)
    .eq('status', 'sent')
    .in('project_id', projectIds);
  if (error) {
    throw new Error(`Failed to load survey send counts for user ${userId}: ${error.message}`);
  }
  for (const row of data ?? []) {
    const projectId = row.project_id as number;
    counts.set(projectId, (counts.get(projectId) ?? 0) + 1);
  }
  return counts;
}

/** Most recent successful survey email sent to this developer, across every project. */
export async function getLastSentAtForUser(userId: number): Promise<Date | null> {
  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('survey_recipient')
    .select('sent_at')
    .eq('user_id', userId)
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to look up last survey email for user ${userId}: ${error.message}`);
  return data?.sent_at ? new Date(data.sent_at) : null;
}

/** Logs one email attempt; a duplicate (survey_id, user_id) row means it's already recorded. */
export async function recordSurveyRecipient(input: RecordSurveyRecipientInput): Promise<void> {
  try {
    await insertRow('survey_recipient', {
      survey_id: input.surveyId,
      project_id: input.projectId,
      user_id: input.userId,
      email: input.email,
      status: input.status,
      skip_reason: input.skipReason ?? null,
      sent_at: input.sentAt?.toISOString() ?? null,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('23505')) return; // already recorded
    throw error;
  }
}
