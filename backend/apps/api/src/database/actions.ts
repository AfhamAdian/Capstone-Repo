/**
 * Actions Database
 * Supabase queries for the `actions` table.
 * Returns raw rows (snake_case) — no DTO mapping, matching existing codebase style.
 */

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
};

export type InsertActionInput = {
  projectIds: string[];
  problem: string;
  reason: string;
  actionTaken: string;
  timestamp: string;
  loggedBy: string;
};

export type ListActionsFilters = {
  projectId?: string;
  from?: string;
  to?: string;
  pendingOnly?: boolean;
  limit?: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PostgREST "no rows returned" error code for .single()
const NO_ROWS_CODE = 'PGRST116';

export async function insertAction(input: InsertActionInput): Promise<ActionRow> {
  const client = assertSupabaseClient();

  const { data, error } = await client
    .from('actions')
    .insert([
      {
        project_ids: input.projectIds,
        problem: input.problem,
        reason: input.reason,
        action_taken: input.actionTaken,
        action_date: input.timestamp,
        logged_by: input.loggedBy,
      },
    ])
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to insert action: ${error?.message ?? 'No row returned'}`);
  }

  return data as ActionRow;
}

export async function listActions(filters: ListActionsFilters = {}): Promise<ActionRow[]> {
  const client = assertSupabaseClient();

  let query = client
    .from('actions')
    .select('*')
    .order('action_date', { ascending: false });

  if (filters.projectId) {
    query = query.contains('project_ids', [filters.projectId]);
  }

  if (filters.from) {
    query = query.gte('action_date', filters.from);
  }

  if (filters.to) {
    query = query.lte('action_date', filters.to);
  }

  if (filters.pendingOnly) {
    query = query.is('effectiveness', null);
  }

  query = query.limit(filters.limit ?? 100);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list actions: ${error.message}`);
  }

  return (data ?? []) as ActionRow[];
}

export async function getActionById(id: string): Promise<ActionRow | null> {
  if (!UUID_RE.test(id)) {
    return null;
  }

  const client = assertSupabaseClient();

  const { data, error } = await client
    .from('actions')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === NO_ROWS_CODE) {
      return null;
    }
    throw new Error(`Failed to get action: ${error.message}`);
  }

  return data as ActionRow;
}

export async function searchActions(q: string, limit: number): Promise<ActionRow[]> {
  const client = assertSupabaseClient();

  // Strip characters that would break the PostgREST .or() filter string
  const sanitized = q.replace(/[%_,"()\\]/g, ' ').trim();
  const pattern = `%${sanitized}%`;

  const { data, error } = await client
    .from('actions')
    .select('*')
    .or(`problem.ilike.${pattern},reason.ilike.${pattern},action_taken.ilike.${pattern}`)
    .order('action_date', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to search actions: ${error.message}`);
  }

  return (data ?? []) as ActionRow[];
}

export async function updateActionEffectiveness(id: string, rating: number): Promise<ActionRow | null> {
  if (!UUID_RE.test(id)) {
    return null;
  }

  const client = assertSupabaseClient();

  const { data, error } = await client
    .from('actions')
    .update({ effectiveness: rating })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === NO_ROWS_CODE) {
      return null;
    }
    throw new Error(`Failed to update action effectiveness: ${error.message}`);
  }

  return data as ActionRow;
}
