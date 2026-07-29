import { assertSupabaseClient } from '../config/supabase.js';
import { env } from '../config/env.js';

export interface ProjectMemberWithUser {
  projectMemberId: number;
  userId: number;
  email: string;
  name: string;
  /** Null unless the developer has linked their Discord account (see db/migrations/005_discord_user_id.sql) - no email-based lookup exists for Discord. */
  discordUserId: string | null;
  lastSurveySentAt: string | null;
}

export async function getProjectMembersWithUser(projectId: number): Promise<ProjectMemberWithUser[]> {
  const client = assertSupabaseClient();

  const { data: members, error: memberError } = await client
    .from('projectmember')
    .select('id, user_id, last_survey_sent_at')
    .eq('project_id', projectId);
  if (memberError) {
    throw new Error(`Failed to load members for project ${projectId}: ${memberError.message}`);
  }
  if (!members || members.length === 0) return [];

  const userIds = members.map((m) => m.user_id as number);
  const { data: users, error: userError } = await client.from('User').select('id, email, name, discord_user_id').in('id', userIds);
  if (userError) {
    throw new Error(`Failed to load users for project ${projectId} members: ${userError.message}`);
  }
  const userById = new Map((users ?? []).map((u) => [u.id as number, u]));

  return members.map((m) => {
    const user = userById.get(m.user_id as number);
    return {
      projectMemberId: m.id as number,
      userId: m.user_id as number,
      email: (user?.email as string) ?? '',
      name: (user?.name as string) ?? '',
      discordUserId: (user?.discord_user_id as string) ?? null,
      lastSurveySentAt: (m.last_survey_sent_at as string) ?? null,
    };
  });
}

/**
 * Most recent survey-sent timestamp per user, across ALL of their project
 * memberships (not just one project). A developer who is a member of multiple
 * projects must not be surveyed twice in the same month regardless of which
 * project's round picks them first, so eligibility must be checked against
 * this global value, not `projectmember.last_survey_sent_at` for a single row.
 */
export async function getLastSurveyedAtByUser(userIds: number[]): Promise<Map<number, Date>> {
  if (userIds.length === 0) return new Map();
  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('projectmember')
    .select('user_id, last_survey_sent_at')
    .in('user_id', userIds)
    .not('last_survey_sent_at', 'is', null);
  if (error) {
    throw new Error(`Failed to load last-surveyed timestamps: ${error.message}`);
  }

  const byUser = new Map<number, Date>();
  for (const row of data ?? []) {
    const userId = row.user_id as number;
    const at = new Date(row.last_survey_sent_at as string);
    const existing = byUser.get(userId);
    if (!existing || at > existing) byUser.set(userId, at);
  }
  return byUser;
}

/**
 * Eligible for auto-pulse selection: never surveyed (by ANY of their project
 * memberships), or SURVEY_MIN_DAYS_BETWEEN_SURVEYS+ days since their last
 * survey, and not already surveyed this calendar month. Live-checked at
 * round-execution time (not precomputed), so a developer surveyed by an
 * earlier project in the same job run is correctly excluded from a later
 * project's round in the same run.
 */
export async function getEligibleMembersForAutoPulse(projectId: number, now: Date = new Date()): Promise<ProjectMemberWithUser[]> {
  const all = await getProjectMembersWithUser(projectId);
  if (all.length === 0) return [];

  const lastSurveyedByUser = await getLastSurveyedAtByUser(all.map((m) => m.userId));
  const minGapAgo = new Date(now.getTime() - env.surveyMinDaysBetweenSurveys * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  return all.filter((m) => {
    const last = lastSurveyedByUser.get(m.userId);
    if (!last) return true;
    if (last >= startOfMonth) return false; // already surveyed this calendar month (any project)
    return last < minGapAgo;
  });
}

export async function updateLastSurveySentAt(projectMemberId: number, sentAt: Date = new Date()): Promise<void> {
  const client = assertSupabaseClient();
  const { error } = await client
    .from('projectmember')
    .update({ last_survey_sent_at: sentAt.toISOString() })
    .eq('id', projectMemberId);
  if (error) {
    throw new Error(`Failed to update last_survey_sent_at for member ${projectMemberId}: ${error.message}`);
  }
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
