// Project membership: which users are assigned to a project. Everyone is a plain member (no per-member role).

import { assertSupabaseClient } from '../config/supabase.js';

export interface ProjectMemberRecord {
  id: number;
  project_id: number;
  user_id: number;
  joined_at: string | null;
}

const MEMBER_COLUMNS = 'id, project_id, user_id, joined_at';

export async function addProjectMember(input: {
  projectId: number;
  userId: number;
}): Promise<ProjectMemberRecord> {
  const client = assertSupabaseClient();

  const { data, error } = await client
    .from('projectmember')
    .insert([
      {
        project_id: input.projectId,
        user_id: input.userId,
        joined_at: new Date().toISOString(),
      },
    ])
    .select(MEMBER_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(`Failed to add project member: ${error?.message ?? 'no row returned'}`);
  }
  return data as ProjectMemberRecord;
}

// Remove a member from a project. Idempotent — deleting a non-member is a no-op.
export async function deleteProjectMember(projectId: number, userId: number): Promise<void> {
  const client = assertSupabaseClient();

  const { error } = await client
    .from('projectmember')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to remove project member: ${error.message}`);
  }
}

export async function listProjectMembers(projectId: number): Promise<ProjectMemberRecord[]> {
  const client = assertSupabaseClient();

  const { data, error } = await client
    .from('projectmember')
    .select(MEMBER_COLUMNS)
    .eq('project_id', projectId);

  if (error) {
    throw new Error(`Failed to list project members: ${error.message}`);
  }
  return (data as ProjectMemberRecord[]) ?? [];
}
