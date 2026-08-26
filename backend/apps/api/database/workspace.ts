// Workspace persistence: a named group of projects backed by one VCS connection (provider + org + PAT).
// Scoped to a company; a company can have many workspaces. The access_token is sensitive — callers
// (services) decide what to expose; this layer returns the full row.

import { assertSupabaseClient } from '../config/supabase.js';

export interface WorkspaceRecord {
  id: number;
  company_id: number;
  name: string;
  vcs_provider: string;
  organization: string;
  access_token: string;
  created_at: string | null;
}

const WORKSPACE_COLUMNS = 'id, company_id, name, vcs_provider, organization, access_token, created_at';

export async function createWorkspace(input: {
  companyId: number;
  name: string;
  vcsProvider: string;
  organization: string;
  accessToken: string;
}): Promise<WorkspaceRecord> {
  const client = assertSupabaseClient();

  const { data, error } = await client
    .from('workspace')
    .insert([
      {
        company_id: input.companyId,
        name: input.name.trim(),
        vcs_provider: input.vcsProvider,
        organization: input.organization.trim(),
        access_token: input.accessToken,
        created_at: new Date().toISOString(),
      },
    ])
    .select(WORKSPACE_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(`Failed to create workspace: ${error?.message ?? 'no row returned'}`);
  }
  return data as WorkspaceRecord;
}

// Newest first; scoped to a single company.
export async function listWorkspacesByCompany(companyId: number): Promise<WorkspaceRecord[]> {
  const client = assertSupabaseClient();

  const { data, error } = await client
    .from('workspace')
    .select(WORKSPACE_COLUMNS)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list workspaces: ${error.message}`);
  }
  return (data as WorkspaceRecord[]) ?? [];
}

export async function getWorkspaceById(id: number): Promise<WorkspaceRecord | null> {
  const client = assertSupabaseClient();

  const { data, error } = await client
    .from('workspace')
    .select(WORKSPACE_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load workspace ${id}: ${error.message}`);
  }
  return (data as WorkspaceRecord | null) ?? null;
}
