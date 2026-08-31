import { assertSupabaseClient } from '../config/supabase.js';
import { ACTION_COLUMNS, type ActionRow, type ActionSearchRow } from './actions.js';


export type ActionEmbeddingStatus = 'pending' | 'processing' | 'ready' | 'failed';

export interface ActionEmbeddingRow {
  action_id: string;
  embedding_version: string;
  provider: 'gemini' | 'siliconflow';
  model: string;
  dimensions: number;
  content_hash: string;
  status: ActionEmbeddingStatus;
  embedding?: string | number[] | null;
  attempt_count: number;
  last_error: string | null;
  embedded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PendingActionEmbeddingInput {
  actionId: string;
  embeddingVersion: string;
  model: string;
  dimensions: number;
  contentHash: string;
}

export async function upsertPendingActionEmbedding(input: PendingActionEmbeddingInput): Promise<void> {
  const client = assertSupabaseClient();
  const { error } = await client
    .from('action_embeddings')
    .upsert({
      action_id: input.actionId,
      embedding_version: input.embeddingVersion,
      provider: 'gemini',
      model: input.model,
      dimensions: input.dimensions,
      content_hash: input.contentHash,
      status: 'pending',
      embedding: null,
      last_error: null,
      embedded_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'action_id,embedding_version' });

  if (error) {
    throw new Error(`Failed to prepare action embedding: ${error.message}`);
  }
}

export async function getActionEmbedding(
  actionId: string,
  embeddingVersion: string,
): Promise<ActionEmbeddingRow | null> {
  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('action_embeddings')
    .select('*')
    .eq('action_id', actionId)
    .eq('embedding_version', embeddingVersion)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load action embedding: ${error.message}`);
  }

  return data as ActionEmbeddingRow | null;
}

export async function claimActionEmbedding(actionId: string, embeddingVersion: string): Promise<boolean> {
  const client = assertSupabaseClient();
  const { data, error } = await client.rpc('claim_action_embedding', {
    p_action_id: actionId,
    p_embedding_version: embeddingVersion,
  });

  if (error) {
    throw new Error(`Failed to claim action embedding: ${error.message}`);
  }

  return data === true;
}

export async function completeActionEmbedding(input: {
  actionId: string;
  embeddingVersion: string;
  model: string;
  dimensions: number;
  contentHash: string;
  embedding: number[];
}): Promise<void> {
  const client = assertSupabaseClient();
  const now = new Date().toISOString();
  const { error } = await client
    .from('action_embeddings')
    .update({
      provider: 'gemini',
      model: input.model,
      dimensions: input.dimensions,
      content_hash: input.contentHash,
      status: 'ready',
      embedding: JSON.stringify(input.embedding),
      last_error: null,
      embedded_at: now,
      updated_at: now,
    })
    .eq('action_id', input.actionId)
    .eq('embedding_version', input.embeddingVersion);

  if (error) {
    throw new Error(`Failed to store action embedding: ${error.message}`);
  }
}

export async function failActionEmbedding(
  actionId: string,
  embeddingVersion: string,
  errorMessage: string,
): Promise<void> {
  const client = assertSupabaseClient();
  const { error } = await client
    .from('action_embeddings')
    .update({
      status: 'failed',
      last_error: errorMessage.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq('action_id', actionId)
    .eq('embedding_version', embeddingVersion);

  if (error) {
    throw new Error(`Failed to record action embedding failure: ${error.message}`);
  }
}

export async function matchActionsByEmbedding(input: {
  embedding: number[];
  embeddingVersion: string;
  threshold: number;
  limit: number;
  companyId: number;
  ownerUserId?: number;
  projectId?: string;
}): Promise<ActionSearchRow[]> {
  const client = assertSupabaseClient();
  const { data, error } = await client.rpc('match_company_actions', {
    query_embedding: JSON.stringify(input.embedding),
    target_embedding_version: input.embeddingVersion,
    filter_company_id: input.companyId,
    filter_logged_by_user_id: input.ownerUserId ?? null,
    match_threshold: input.threshold,
    match_count: input.limit,
    filter_project_id: input.projectId ?? null,
  });

  if (error) {
    throw new Error(`Failed to match action embeddings: ${error.message}`);
  }

  return (data ?? []) as ActionSearchRow[];
}

export async function listActionsForEmbedding(limit: number): Promise<ActionRow[]> {
  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('actions')
    .select(ACTION_COLUMNS)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list actions for embedding: ${error.message}`);
  }

  return (data ?? []) as ActionRow[];
}

export async function listRetryableActionEmbeddings(
  embeddingVersion: string,
  limit: number,
): Promise<ActionEmbeddingRow[]> {
  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('action_embeddings')
    .select('*')
    .eq('embedding_version', embeddingVersion)
    .in('status', ['pending', 'failed'])
    .order('updated_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list retryable action embeddings: ${error.message}`);
  }

  return (data ?? []) as ActionEmbeddingRow[];
}

export async function resetStaleActionEmbeddings(
  embeddingVersion: string,
  staleBefore: Date,
): Promise<number> {
  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('action_embeddings')
    .update({
      status: 'failed',
      last_error: 'Recovered stale processing job for retry',
      updated_at: new Date().toISOString(),
    })
    .eq('embedding_version', embeddingVersion)
    .eq('status', 'processing')
    .lt('updated_at', staleBefore.toISOString())
    .select('action_id');

  if (error) {
    throw new Error(`Failed to reset stale action embeddings: ${error.message}`);
  }

  return data?.length ?? 0;
}
