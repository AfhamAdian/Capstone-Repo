// Per-project tool integrations. One row per tool; connection details live in `config` (jsonb).
//
// The credential fields inside config (a Jira/SonarQube token, the Jira account email paired with
// its token) are encrypted at rest — this module is the only place that reads/writes this table, so
// every caller above it always sees plaintext. Non-secret fields (owner, repo, baseUrl, projectKey,
// ...) are left as-is since they're used for display/matching and aren't sensitive.
//
// TEMPORARY: encryption disabled in production (see encryptConfig/decryptConfig below) - do not
// remove the encryptSecret/decryptSecret code, just re-enable the commented lines to restore it.

import type { SupportedTool, ToolCategory } from '@libs/sync/types.js';
import { assertSupabaseClient } from '../config/supabase.js';
// import { encryptSecret, decryptSecret } from '@libs/security/secret-crypto.js';

export interface ToolIntegrationRecord {
  id: number;
  project_id: number;
  tool_category: ToolCategory;
  tool_name: SupportedTool;
  config: Record<string, unknown>;
  last_synced_at: string | null;
}

const INTEGRATION_COLUMNS = 'id, project_id, tool_category, tool_name, config, last_synced_at';

// Config keys that hold credential material rather than plain identifiers.
const SECRET_CONFIG_KEYS = new Set(['token', 'email']);

function encryptConfig(config: Record<string, unknown>): Record<string, unknown> {
  // TEMPORARY: encryption disabled - see note above.
  return { ...config };
  // const out = { ...config };
  // for (const key of SECRET_CONFIG_KEYS) {
  //   const value = out[key];
  //   if (typeof value === 'string' && value.length > 0) {
  //     out[key] = encryptSecret(value);
  //   }
  // }
  // return out;
}

function decryptConfig(config: Record<string, unknown>): Record<string, unknown> {
  // TEMPORARY: encryption disabled - see note above.
  return { ...config };
  // const out = { ...config };
  // for (const key of SECRET_CONFIG_KEYS) {
  //   const value = out[key];
  //   if (typeof value === 'string' && value.length > 0) {
  //     out[key] = decryptSecret(value);
  //   }
  // }
  // return out;
}

function decryptRecord(record: ToolIntegrationRecord): ToolIntegrationRecord {
  return { ...record, config: decryptConfig(record.config ?? {}) };
}

export async function addIntegration(input: {
  projectId: number;
  category: ToolCategory;
  toolName: SupportedTool;
  config: Record<string, unknown>;
}): Promise<ToolIntegrationRecord> {
  const client = assertSupabaseClient();

  const { data, error } = await client
    .from('projecttoolintegration')
    .insert([
      {
        project_id: input.projectId,
        tool_category: input.category,
        tool_name: input.toolName,
        config: encryptConfig(input.config),
      },
    ])
    .select(INTEGRATION_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(`Failed to add tool integration: ${error?.message ?? 'no row returned'}`);
  }
  return decryptRecord(data as ToolIntegrationRecord);
}

// Integrations for many projects at once (used to annotate a project list with its vcs).
export async function listIntegrationsForProjects(
  projectIds: number[],
): Promise<ToolIntegrationRecord[]> {
  if (projectIds.length === 0) {
    return [];
  }
  const client = assertSupabaseClient();

  const { data, error } = await client
    .from('projecttoolintegration')
    .select(INTEGRATION_COLUMNS)
    .in('project_id', projectIds);

  if (error) {
    throw new Error(`Failed to list tool integrations: ${error.message}`);
  }
  return ((data as ToolIntegrationRecord[]) ?? []).map(decryptRecord);
}

// All integrations for a project (used for the project detail view and sync).
// Merge a partial config into an existing integration (used by the connector settings' Save).
export async function updateIntegrationConfig(
  projectId: number,
  toolName: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const client = assertSupabaseClient();

  const { data: existing, error: fetchErr } = await client
    .from('projecttoolintegration')
    .select('id, config')
    .eq('project_id', projectId)
    .eq('tool_name', toolName)
    .maybeSingle();
  if (fetchErr) {
    throw new Error(`Failed to load ${toolName} integration: ${fetchErr.message}`);
  }
  if (!existing) {
    throw new Error(`No ${toolName} integration exists for this project`);
  }

  const merged = { ...decryptConfig((existing.config as Record<string, unknown>) ?? {}), ...patch };
  const { error } = await client
    .from('projecttoolintegration')
    .update({ config: encryptConfig(merged) })
    .eq('id', existing.id);
  if (error) {
    throw new Error(`Failed to update ${toolName} integration: ${error.message}`);
  }
}

export async function listIntegrations(projectId: number): Promise<ToolIntegrationRecord[]> {
  const client = assertSupabaseClient();

  const { data, error } = await client
    .from('projecttoolintegration')
    .select(INTEGRATION_COLUMNS)
    .eq('project_id', projectId);

  if (error) {
    throw new Error(`Failed to list tool integrations: ${error.message}`);
  }
  return ((data as ToolIntegrationRecord[]) ?? []).map(decryptRecord);
}
