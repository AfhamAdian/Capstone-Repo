import { assertSupabaseClient } from '../config/supabase.js';
import type { SurveyLinkMode } from '@libs/security/survey-link.js';

export type SurveyBundleStatus = 'pending' | 'used' | 'expired';

export interface SurveyBundleRow {
  id: number;
  user_id: number | null;
  cycle_id: string;
  status: SurveyBundleStatus;
  mode: SurveyLinkMode;
  scheduled_send_at: string;
  notified_at: string | null;
  expires_at: string;
  used_at: string | null;
}

export interface CreateBundleInput {
  userId: number | null; // null for shared cohort bundles
  cycleId: string;
  expiresAt: Date;
  mode: SurveyLinkMode;
}

export async function createBundle(input: CreateBundleInput): Promise<number> {
  const client = assertSupabaseClient();

  const { data, error } = await client
    .from('surveybundle')
    .insert([{ user_id: input.userId, cycle_id: input.cycleId, expires_at: input.expiresAt.toISOString(), mode: input.mode }])
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create survey bundle: ${error?.message ?? 'No bundle row returned'}`);
  }
  return data.id as number;
}

/** The one shared, pending, unexpired bundle for a cycle (e.g. a project's monthly pulse), if it exists. */
export async function findSharedBundleByCycle(cycleId: string): Promise<SurveyBundleRow | null> {
  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('surveybundle')
    .select('*')
    .eq('cycle_id', cycleId)
    .eq('mode', 'shared')
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

/** Idempotently links a survey to a bundle (ignores the duplicate on the unique (bundle_id, survey_id) constraint). */
export async function linkSurveyToBundleIfAbsent(bundleId: number, surveyId: number, projectMemberId: number | null): Promise<void> {
  const client = assertSupabaseClient();
  const { data: existing, error: findError } = await client
    .from('surveybundlesurvey')
    .select('id')
    .eq('bundle_id', bundleId)
    .eq('survey_id', surveyId)
    .maybeSingle();
  if (findError) {
    throw new Error(`Failed to check bundle/survey link: ${findError.message}`);
  }
  if (existing) return;
  await linkSurveyToBundle(bundleId, surveyId, projectMemberId);
}

export async function linkSurveyToBundle(bundleId: number, surveyId: number, projectMemberId: number | null): Promise<void> {
  const client = assertSupabaseClient();

  const { error } = await client
    .from('surveybundlesurvey')
    .insert([{ bundle_id: bundleId, survey_id: surveyId, project_member_id: projectMemberId }]);

  if (error) {
    throw new Error(`Failed to link survey ${surveyId} to bundle ${bundleId}: ${error.message}`);
  }
}

export async function markBundleNotified(bundleId: number): Promise<void> {
  const client = assertSupabaseClient();
  const { error } = await client.from('surveybundle').update({ notified_at: new Date().toISOString() }).eq('id', bundleId);
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

/** For reusing an in-flight bundle within the same send event instead of minting a second link for the same developer. */
export async function findPendingBundleForUser(userId: number, cyclePrefix: string): Promise<SurveyBundleRow | null> {
  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('surveybundle')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .like('cycle_id', `${cyclePrefix}%`)
    .gt('expires_at', new Date().toISOString())
    .order('scheduled_send_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to look up pending bundle for user ${userId}: ${error.message}`);
  }
  return (data as SurveyBundleRow) ?? null;
}

/** Atomic single-use consumption. Returns false (never throws) if the bundle was already used/expired or doesn't exist. */
export async function consumeBundle(bundleId: number): Promise<boolean> {
  const client = assertSupabaseClient();

  const { data, error } = await client
    .from('surveybundle')
    .update({ status: 'used', used_at: new Date().toISOString() })
    .eq('id', bundleId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .select('id');

  if (error) {
    throw new Error(`Failed to consume bundle ${bundleId}: ${error.message}`);
  }
  return (data?.length ?? 0) > 0;
}

export interface BundleSurveyEntry {
  surveyId: number;
  projectId: number;
  projectName: string;
}

/** The set of per-project surveys bundled into one link, for rendering the combined form grouped by project. */
export async function getSurveysForBundle(bundleId: number): Promise<BundleSurveyEntry[]> {
  const client = assertSupabaseClient();

  const { data: links, error: linkError } = await client
    .from('surveybundlesurvey')
    .select('survey_id')
    .eq('bundle_id', bundleId);
  if (linkError) {
    throw new Error(`Failed to load survey links for bundle ${bundleId}: ${linkError.message}`);
  }
  const surveyIds = (links ?? []).map((l) => l.survey_id as number);
  if (surveyIds.length === 0) return [];

  const { data: surveys, error: surveyError } = await client
    .from('survey')
    .select('id, project_id')
    .in('id', surveyIds);
  if (surveyError) {
    throw new Error(`Failed to load surveys for bundle ${bundleId}: ${surveyError.message}`);
  }

  const projectIds = [...new Set((surveys ?? []).map((s) => s.project_id as number))];
  const { data: projects, error: projectError } = await client.from('project').select('id, name').in('id', projectIds);
  if (projectError) {
    throw new Error(`Failed to load projects for bundle ${bundleId}: ${projectError.message}`);
  }
  const projectNameById = new Map((projects ?? []).map((p) => [p.id as number, p.name as string]));

  return (surveys ?? []).map((s) => ({
    surveyId: s.id as number,
    projectId: s.project_id as number,
    projectName: projectNameById.get(s.project_id as number) ?? `Project ${s.project_id}`,
  }));
}
