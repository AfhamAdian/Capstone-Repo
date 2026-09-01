import { assertSupabaseClient } from '../config/supabase.js';
import { findUsersByIds } from './user.js';

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

/** All project member user_ids. `projectmember` no longer carries a role — developer/admin is on `User.role`. */
async function listProjectMemberUserIds(projectId: number): Promise<number[]> {
  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('projectmember')
    .select('user_id')
    .eq('project_id', projectId);
  if (error) {
    throw new Error(`Failed to list members for project ${projectId}: ${error.message}`);
  }
  return (data ?? []).map((row) => row.user_id as number);
}

/** Audience size for survey response rate: project members whose `User.role = 'member'` (i.e. not admin). */
export async function countProjectDevelopers(projectId: number): Promise<number> {
  const userIds = await listProjectMemberUserIds(projectId);
  if (userIds.length === 0) return 0;
  const users = await findUsersByIds(userIds);
  return users.filter((u) => u.role === 'member').length;
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

/** Developer user_ids for a project, for per-developer survey email delivery. */
export async function listProjectDeveloperUserIds(projectId: number): Promise<number[]> {
  const userIds = await listProjectMemberUserIds(projectId);
  if (userIds.length === 0) return [];
  const users = await findUsersByIds(userIds);
  return users.filter((u) => u.role === 'member').map((u) => u.id);
}

/** How many projects a user belongs to — used to decide if survey rotation across projects applies. */
export async function countProjectsForUser(userId: number): Promise<number> {
  const client = assertSupabaseClient();
  const { count, error } = await client
    .from('projectmember')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) {
    throw new Error(`Failed to count projects for user ${userId}: ${error.message}`);
  }
  return count ?? 0;
}

export async function getAllProjectIds(): Promise<number[]> {
  const client = assertSupabaseClient();
  const { data, error } = await client.from('project').select('id');
  if (error) {
    throw new Error(`Failed to list projects: ${error.message}`);
  }
  return (data ?? []).map((p) => p.id as number);
}
