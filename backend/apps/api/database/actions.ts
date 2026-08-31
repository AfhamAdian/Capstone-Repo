/** Company- and owner-scoped persistence for management actions. */

import { assertSupabaseClient } from '../config/supabase.js';

export type ActionRow = {
  id: string;
  project_ids: string[];
  problem: string;
  reason: string;
  action_taken: string;
  action_date: string;
  effectiveness: number | null;
  logged_by: string;
  created_at: string;
  company_id: number | null;
  logged_by_user_id: number | null;
  next_review_at: string | null;
  effectiveness_rated_by_user_id: number | null;
  effectiveness_rated_at: string | null;
  updated_at: string;
};

export type ActionSearchRow = ActionRow & { similarity?: number };
export type ActionScope = { companyId: number; ownerUserId?: number };

export type InsertActionInput = {
  companyId: number;
  ownerUserId: number;
  projectIds: string[];
  problem: string;
  reason: string;
  actionTaken: string;
  timestamp: string;
  loggedBy: string;
  nextReviewAt: string;
};

export type UpdateActionInput = {
  projectIds: string[];
  problem: string;
  reason: string;
  actionTaken: string;
  timestamp: string;
};

export type ListActionsFilters = ActionScope & {
  projectId?: string;
  from?: string;
  to?: string;
  pendingOnly?: boolean;
  limit?: number;
  offset?: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ACTION_COLUMNS = 'id,project_ids,problem,reason,action_taken,action_date,effectiveness,logged_by,created_at,company_id,logged_by_user_id,next_review_at,effectiveness_rated_by_user_id,effectiveness_rated_at,updated_at';

export function isActionId(value: string): boolean {
  return UUID_RE.test(value);
}

export function sanitizeActionSearchQuery(q: string): string {
  return q.replace(/[%_,"()\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function insertAction(input: InsertActionInput): Promise<ActionRow> {
  const client = assertSupabaseClient();
  const { data, error } = await client.from('actions').insert([{
    company_id: input.companyId,
    logged_by_user_id: input.ownerUserId,
    project_ids: input.projectIds,
    problem: input.problem,
    reason: input.reason,
    action_taken: input.actionTaken,
    action_date: input.timestamp,
    logged_by: input.loggedBy,
    next_review_at: input.nextReviewAt,
    updated_at: new Date().toISOString(),
  }]).select(ACTION_COLUMNS).single();
  if (error || !data) throw new Error(`Failed to insert action: ${error?.message ?? 'No row returned'}`);
  return data as ActionRow;
}

export async function listActions(filters: ListActionsFilters): Promise<ActionRow[]> {
  const client = assertSupabaseClient();
  let query = client.from('actions').select(ACTION_COLUMNS)
    .eq('company_id', filters.companyId)
    .order('action_date', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: true });
  if (filters.ownerUserId !== undefined) query = query.eq('logged_by_user_id', filters.ownerUserId);
  if (filters.projectId) query = query.contains('project_ids', [filters.projectId]);
  if (filters.from) query = query.gte('action_date', filters.from);
  if (filters.to) query = query.lte('action_date', filters.to);
  if (filters.pendingOnly) query = query.is('effectiveness', null);
  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;
  const { data, error } = await query.range(offset, offset + limit - 1);
  if (error) throw new Error(`Failed to list actions: ${error.message}`);
  return (data ?? []) as ActionRow[];
}

export async function getActionById(id: string, scope: ActionScope): Promise<ActionRow | null> {
  if (!isActionId(id)) return null;
  const client = assertSupabaseClient();
  let query = client.from('actions').select(ACTION_COLUMNS).eq('id', id).eq('company_id', scope.companyId);
  if (scope.ownerUserId !== undefined) query = query.eq('logged_by_user_id', scope.ownerUserId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Failed to get action: ${error.message}`);
  return data as ActionRow | null;
}

export async function searchActions(q: string, limit: number, scope: ActionScope, projectId?: string): Promise<ActionRow[]> {
  const sanitized = sanitizeActionSearchQuery(q);
  if (!sanitized) return [];
  const client = assertSupabaseClient();
  const pattern = `%${sanitized}%`;
  let query = client.from('actions').select(ACTION_COLUMNS)
    .eq('company_id', scope.companyId)
    .or(`problem.ilike.${pattern},reason.ilike.${pattern},action_taken.ilike.${pattern}`)
    .order('action_date', { ascending: false });
  if (scope.ownerUserId !== undefined) query = query.eq('logged_by_user_id', scope.ownerUserId);
  if (projectId) query = query.contains('project_ids', [projectId]);
  const { data, error } = await query.limit(limit);
  if (error) throw new Error(`Failed to search actions: ${error.message}`);
  return (data ?? []) as ActionRow[];
}

export async function updateActionRecord(id: string, scope: ActionScope, input: UpdateActionInput): Promise<ActionRow | null> {
  if (!isActionId(id)) return null;
  const client = assertSupabaseClient();
  let query = client.from('actions').update({
      project_ids: input.projectIds,
      problem: input.problem,
      reason: input.reason,
      action_taken: input.actionTaken,
      action_date: input.timestamp,
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('company_id', scope.companyId);
  if (scope.ownerUserId !== undefined) query = query.eq('logged_by_user_id', scope.ownerUserId);
  const { data, error } = await query.select(ACTION_COLUMNS).maybeSingle();
  if (error) throw new Error(`Failed to update action: ${error.message}`);
  return data as ActionRow | null;
}

export async function deleteActionRecord(id: string, scope: ActionScope): Promise<boolean> {
  if (!isActionId(id)) return false;
  const client = assertSupabaseClient();
  let query = client.from('actions').delete().eq('id', id).eq('company_id', scope.companyId);
  if (scope.ownerUserId !== undefined) query = query.eq('logged_by_user_id', scope.ownerUserId);
  const { data, error } = await query.select('id');
  if (error) throw new Error(`Failed to delete action: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export async function updateActionEffectiveness(
  id: string,
  ownerScope: Required<ActionScope>,
  rating: number,
): Promise<ActionRow | null> {
  if (!isActionId(id)) return null;
  const client = assertSupabaseClient();
  const now = new Date().toISOString();
  const { data, error } = await client.from('actions').update({
      effectiveness: rating,
      effectiveness_rated_by_user_id: ownerScope.ownerUserId,
      effectiveness_rated_at: now,
      updated_at: now,
    }).eq('id', id)
    .eq('company_id', ownerScope.companyId)
    .eq('logged_by_user_id', ownerScope.ownerUserId)
    .select(ACTION_COLUMNS).maybeSingle();
  if (error) throw new Error(`Failed to update action effectiveness: ${error.message}`);
  return data as ActionRow | null;
}

export async function deferActionReview(
  id: string,
  ownerScope: Required<ActionScope>,
  nextReviewAt: string,
): Promise<ActionRow | null> {
  if (!isActionId(id)) return null;
  const client = assertSupabaseClient();
  const { data, error } = await client.from('actions')
    .update({ next_review_at: nextReviewAt, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', ownerScope.companyId)
    .eq('logged_by_user_id', ownerScope.ownerUserId)
    .is('effectiveness', null)
    .select(ACTION_COLUMNS).maybeSingle();
  if (error) throw new Error(`Failed to defer action review: ${error.message}`);
  return data as ActionRow | null;
}

export async function listOwnerPendingReviews(companyId: number, ownerUserId: number, limit = 200): Promise<ActionRow[]> {
  const client = assertSupabaseClient();
  const { data, error } = await client.from('actions').select(ACTION_COLUMNS)
    .eq('company_id', companyId)
    .eq('logged_by_user_id', ownerUserId)
    .is('effectiveness', null)
    .order('next_review_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Failed to list effectiveness reviews: ${error.message}`);
  return (data ?? []) as ActionRow[];
}

/** Worker-only lookup; never expose this unscoped query through an HTTP route. */
export async function getActionByIdInternal(id: string): Promise<ActionRow | null> {
  if (!isActionId(id)) return null;
  const client = assertSupabaseClient();
  const { data, error } = await client.from('actions').select(ACTION_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed to get action: ${error.message}`);
  return data as ActionRow | null;
}
