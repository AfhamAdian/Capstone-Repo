import { assertSupabaseClient } from '../config/supabase.js';

export type SurveyBundleStatus = 'pending' | 'closed' | 'expired';

export interface SurveyDeliveryResults {
  slackSent: boolean;
  telegramSent: boolean;
  discordSent: boolean;
}

export interface SurveyBundleRow {
  id: number;
  survey_id: number;
  cycle_id: string;
  status: SurveyBundleStatus;
  scheduled_send_at: string;
  notified_at: string | null;
  expires_at: string;
  delivery_results: Partial<SurveyDeliveryResults>;
}

export interface CreateBundleInput {
  surveyId: number;
  cycleId: string;
  expiresAt: Date;
}

export async function createBundle(input: CreateBundleInput): Promise<number> {
  const client = assertSupabaseClient();

  const { data, error } = await client
    .from('surveybundle')
    .insert([{ survey_id: input.surveyId, cycle_id: input.cycleId, expires_at: input.expiresAt.toISOString() }])
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create survey bundle: ${error?.message ?? 'No bundle row returned'}`);
  }
  return data.id as number;
}

/** The one pending, unexpired shared link for a distribution cycle, if it exists. */
export async function findBundleByCycle(cycleId: string): Promise<SurveyBundleRow | null> {
  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('surveybundle')
    .select('*')
    .eq('cycle_id', cycleId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('scheduled_send_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to look up shared bundle for cycle ${cycleId}: ${error.message}`);
  }
  return (data as SurveyBundleRow) ?? null;
}

export async function markBundleNotified(bundleId: number, results: SurveyDeliveryResults): Promise<void> {
  const client = assertSupabaseClient();
  const { error } = await client
    .from('surveybundle')
    .update({ notified_at: new Date().toISOString(), delivery_results: results })
    .eq('id', bundleId);
  if (error) {
    throw new Error(`Failed to mark bundle ${bundleId} notified: ${error.message}`);
  }
}

export async function getBundleById(bundleId: number): Promise<SurveyBundleRow | null> {
  const client = assertSupabaseClient();
  const { data, error } = await client.from('surveybundle').select('*').eq('id', bundleId).maybeSingle();
  if (error) {
    throw new Error(`Failed to load bundle ${bundleId}: ${error.message}`);
  }
  return (data as SurveyBundleRow) ?? null;
}

export async function getLatestBundleForSurvey(surveyId: number): Promise<SurveyBundleRow | null> {
  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('surveybundle')
    .select('*')
    .eq('survey_id', surveyId)
    .order('scheduled_send_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load latest link for survey ${surveyId}: ${error.message}`);
  }
  return (data as SurveyBundleRow) ?? null;
}

export async function updateBundleStatus(bundleId: number, status: SurveyBundleStatus): Promise<void> {
  const client = assertSupabaseClient();
  const { error } = await client.from('surveybundle').update({ status }).eq('id', bundleId);
  if (error) {
    throw new Error(`Failed to mark bundle ${bundleId} ${status}: ${error.message}`);
  }
}

export async function closeBundlesForSurvey(surveyId: number): Promise<void> {
  const client = assertSupabaseClient();
  const { error } = await client
    .from('surveybundle')
    .update({ status: 'closed' })
    .eq('survey_id', surveyId)
    .eq('status', 'pending');
  if (error) {
    throw new Error(`Failed to close links for survey ${surveyId}: ${error.message}`);
  }
}

/** Expires every open link whose response deadline has passed. */
export async function expireDueBundles(now: Date): Promise<number[]> {
  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('surveybundle')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .lte('expires_at', now.toISOString())
    .select('survey_id');
  if (error) {
    throw new Error(`Failed to expire due survey links: ${error.message}`);
  }
  return [...new Set((data ?? []).map((row) => row.survey_id as number))];
}

export interface BundleSurveyEntry {
  surveyId: number;
  projectId: number;
  projectName: string;
}

/** The survey represented by one anonymous shared link. */
export async function getSurveyForBundle(bundleId: number): Promise<BundleSurveyEntry | null> {
  const client = assertSupabaseClient();
  const { data: bundle, error: bundleError } = await client
    .from('surveybundle')
    .select('survey_id')
    .eq('id', bundleId)
    .maybeSingle();
  if (bundleError) {
    throw new Error(`Failed to load survey link ${bundleId}: ${bundleError.message}`);
  }
  if (!bundle) return null;

  const { data: survey, error: surveyError } = await client
    .from('survey')
    .select('id, project_id')
    .eq('id', bundle.survey_id)
    .maybeSingle();
  if (surveyError) {
    throw new Error(`Failed to load survey for link ${bundleId}: ${surveyError.message}`);
  }
  if (!survey) return null;

  const { data: project, error: projectError } = await client
    .from('project')
    .select('id, name')
    .eq('id', survey.project_id)
    .maybeSingle();
  if (projectError) {
    throw new Error(`Failed to load project for survey link ${bundleId}: ${projectError.message}`);
  }
  return {
    surveyId: survey.id as number,
    projectId: survey.project_id as number,
    projectName: (project?.name as string) ?? `Project ${survey.project_id}`,
  };
}
