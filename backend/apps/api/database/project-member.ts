import { assertSupabaseClient } from '../config/supabase.js';

export async function countProjectMembers(projectId: number): Promise<number> {
  const client = assertSupabaseClient();
  const { count, error } = await client
    .from('projectmember')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);
  if (error) {
    throw new Error(`Failed to count members for project ${projectId}: ${error.message}`);
  }
  return count ?? 0;
}

/** Used by authorization.service.ts's project-scoped access check. */
export async function isProjectMember(projectId: number, userId: number): Promise<boolean> {
  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('projectmember')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to check membership for user ${userId} in project ${projectId}: ${error.message}`);
  }
  return data !== null;
}

export async function getAllProjectIds(): Promise<number[]> {
  const client = assertSupabaseClient();
  const { data, error } = await client.from('project').select('id');
  if (error) {
    throw new Error(`Failed to list projects: ${error.message}`);
  }
  return (data ?? []).map((p) => p.id as number);
}
