// Project membership: which users are assigned to a project (project-level role, defaults to 'member').

import { assertSupabaseClient } from '../config/supabase.js';

export interface ProjectMemberRecord {
  id: number;
  project_id: number;
  user_id: number;
  role: string;
  joined_at: string | null;
}

const MEMBER_COLUMNS = 'id, project_id, user_id, role, joined_at';

export async function addProjectMember(input: {
  projectId: number;
  userId: number;
  role?: string;
}): Promise<ProjectMemberRecord> {
  const client = assertSupabaseClient();

  const { data, error } = await client
    .from('projectmember')
    .insert([
      {
        project_id: input.projectId,
        user_id: input.userId,
        role: input.role ?? 'member',
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
