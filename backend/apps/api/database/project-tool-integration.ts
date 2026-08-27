// Per-project tool integrations. One row per tool; connection details live in `config` (jsonb).

import type { SupportedTool, ToolCategory } from '@libs/sync/types.js';
import { assertSupabaseClient } from '../config/supabase.js';

export interface ToolIntegrationRecord {
  id: number;
  project_id: number;
  tool_category: ToolCategory;
  tool_name: SupportedTool;
  external_project_id: string;
  config: Record<string, unknown>;
  is_active: boolean | null;
  last_synced_at: string | null;
}

const INTEGRATION_COLUMNS =
  'id, project_id, tool_category, tool_name, external_project_id, config, is_active, last_synced_at';

export async function addIntegration(input: {
  projectId: number;
  category: ToolCategory;
  toolName: SupportedTool;
  externalProjectId: string;
  config: Record<string, unknown>;
  isActive?: boolean;
}): Promise<ToolIntegrationRecord> {
  const client = assertSupabaseClient();

  const { data, error } = await client
    .from('projecttoolintegration')
    .insert([
      {
        project_id: input.projectId,
        tool_category: input.category,
        tool_name: input.toolName,
        external_project_id: input.externalProjectId,
        config: input.config,
        is_active: input.isActive ?? true,
      },
    ])
    .select(INTEGRATION_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(`Failed to add tool integration: ${error?.message ?? 'no row returned'}`);
  }
  return data as ToolIntegrationRecord;
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
  return (data as ToolIntegrationRecord[]) ?? [];
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

  const merged = { ...((existing.config as Record<string, unknown>) ?? {}), ...patch };
  const { error } = await client
    .from('projecttoolintegration')
    .update({ config: merged })
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
  return (data as ToolIntegrationRecord[]) ?? [];
}
