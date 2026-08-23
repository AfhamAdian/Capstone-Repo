// Project management: list (workspace-scoped), create (admin only), and detail. Owns authorization.
// Also serves the read-only project + health-score dashboard feed (listProjectsWithHealth / getProjectHealth).

import type { SessionData } from '@libs/auth/session-store.js';
import type { SupportedTool, ToolCategory } from '@libs/sync/types.js';
import {
  createProject as dbCreateProject,
  deleteProject,
  getProjectById,
  isProjectMember,
  listProjectsByCompany,
  listProjectsForMember,
  listProjects as dbListAllProjects,
  getProject as dbGetProjectRow,
  type ProjectRecord,
  type ProjectRow,
} from '../database/project.js';
import {
  addIntegration,
  listIntegrations,
  listIntegrationsForProjects,
  type ToolIntegrationRecord,
} from '../database/project-tool-integration.js';
import { addProjectMember, listProjectMembers } from '../database/projectmember.js';
import { findUserByEmail, findUsersByIds } from '../database/user.js';
import {
  getLatestScoreForProject,
  getLatestScoresForProjects,
  type ProjectRiskScore,
} from '../database/score.js';
import { sendProjectInvites } from './invite.service.js';
import { logger } from '@libs/logger.js';
import { listProjectHealthScoreHistory, type ProjectHealthScoreRow } from '../database/project-health-score.js';
import { listProjectOpsMetricsHistory, type SnapshotOpsMetricsRow } from '../database/project-ops-metrics.js';

const log = logger.child({ component: 'project-service' });

type Auth = SessionData & { sessionId: string };

// Thrown for expected failures so the controller can map them to 4xx.
export class ProjectError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ProjectError';
  }
}

// Valid tool names per category (from the SupportedTool provider unions) — enforces category/tool pairing.
const CATEGORY_TOOLS: Record<ToolCategory, Set<string>> = {
  vcs: new Set(['github', 'gitlab', 'bitbucket']),
  projectManagement: new Set(['jira', 'trello', 'asana']),
  cicd: new Set(['jenkins', 'circleci', 'travisci', 'github-actions']),
  codeQuality: new Set(['sonarqube', 'codeclimate', 'codacy']),
};
const VCS_PROVIDERS = CATEGORY_TOOLS.vcs;
const TOOL_CATEGORIES = new Set<ToolCategory>(['vcs', 'projectManagement', 'cicd', 'codeQuality']);

function assertToolInCategory(category: ToolCategory, toolName: string): void {
  if (!CATEGORY_TOOLS[category]?.has(toolName)) {
    throw new ProjectError(`${toolName} is not a valid ${category} tool`, 400);
  }
}
// Substrings that mark a config key as secret (matches accessToken, clientSecret, apiKey, …).
const SECRET_KEY_PATTERNS = ['token', 'secret', 'password', 'passwd', 'apikey'];

function isSecretKey(key: string): boolean {
  const k = key.toLowerCase();
  return k === 'pass' || SECRET_KEY_PATTERNS.some((pattern) => k.includes(pattern));
}

// Config keys the sync pipeline requires per tool; unknown tools (e.g. bitbucket) are not yet validated.
const REQUIRED_CONFIG_KEYS: Partial<Record<SupportedTool, string[]>> = {
  github: ['token', 'owner', 'repo'],
  gitlab: ['token', 'owner', 'repo'],
  jira: ['token', 'email', 'baseUrl', 'projectKey'],
  sonarqube: ['token', 'projectKey'],
  'github-actions': ['token', 'owner', 'repo'],
};

// Reject at create time any tool whose config is missing the keys sync will later need.
function assertConfigForTool(toolName: SupportedTool, config: Record<string, unknown>): void {
  const required = REQUIRED_CONFIG_KEYS[toolName];
  if (!required) return;
  const missing = required.filter((key) => {
    const value = config?.[key];
    return typeof value !== 'string' || value.trim() === '';
  });
  if (missing.length > 0) {
    throw new ProjectError(`Missing config for ${toolName}: ${missing.join(', ')}`, 400);
  }
}

interface IntegrationInput {
  category: ToolCategory;
  toolName: SupportedTool;
  externalProjectId: string;
  config: Record<string, unknown>;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  vcs: { toolName: string; externalProjectId: string; config?: Record<string, unknown> };
  integrations?: IntegrationInput[];
  invites?: string[];
}

export interface ProjectListItem {
  id: number;
  name: string;
  description: string | null;
  createdAt: string | null;
  vcs: SupportedTool | null;
  score: ProjectRiskScore | null;
}

export interface ProjectDetail extends ProjectListItem {
  integrations: Array<{
    category: ToolCategory;
    toolName: SupportedTool;
    externalProjectId: string;
    config: Record<string, unknown>;
    isActive: boolean | null;
  }>;
  members: Array<{ userId: number; name: string | null; email: string | null; role: string }>;
  pendingInvites?: string[];
}

// Mask secret values so tokens never leave the server.
function redactConfig(config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config ?? {})) {
    out[key] = isSecretKey(key) ? '***' : value;
  }
  return out;
}

async function toDetail(project: ProjectRecord, pendingInvites?: string[]): Promise<ProjectDetail> {
  const [integrations, members, score] = await Promise.all([
    listIntegrations(project.id),
    listProjectMembers(project.id),
    getLatestScoreForProject(project.id),
  ]);
  const vcs = integrations.find((i) => i.tool_category === 'vcs')?.tool_name ?? null;

  // Enrich members with name/email so they read like the pending-invite emails, not bare ids.
  const users = await findUsersByIds(members.map((m) => m.user_id));
  const userById = new Map(users.map((u) => [u.id, u]));

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    createdAt: project.created_at,
    vcs,
    score,
    integrations: integrations.map((i) => ({
      category: i.tool_category,
      toolName: i.tool_name,
      externalProjectId: i.external_project_id,
      config: redactConfig(i.config),
      isActive: i.is_active,
    })),
    members: members.map((m) => {
      const user = userById.get(m.user_id);
      return { userId: m.user_id, name: user?.name ?? null, email: user?.email ?? null, role: m.role };
    }),
    ...(pendingInvites ? { pendingInvites } : {}),
  };
}

// M2.1 — company projects, scoped by role, each annotated with its vcs ("workspace"); optional vcs filter.
export async function listProjects(auth: Auth, vcsFilter?: string): Promise<ProjectListItem[]> {
  const projects =
    auth.role === 'admin'
      ? await listProjectsByCompany(auth.companyId)
      : await listProjectsForMember(auth.companyId, auth.userId);

  const projectIds = projects.map((p) => p.id);
  const [integrations, scores] = await Promise.all([
    listIntegrationsForProjects(projectIds),
    getLatestScoresForProjects(projectIds),
  ]);
  const vcsByProject = new Map<number, SupportedTool>();
  for (const i of integrations) {
    if (i.tool_category === 'vcs') vcsByProject.set(i.project_id, i.tool_name);
  }

  return projects
    .map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      createdAt: p.created_at,
      vcs: vcsByProject.get(p.id) ?? null,
      score: scores.get(p.id) ?? null,
    }))
    .filter((p) => !vcsFilter || p.vcs === vcsFilter);
}

// M2.2 — admin creates a project with its vcs (workspace), optional other tools, and member invites.
export async function createProject(auth: Auth, input: CreateProjectInput): Promise<ProjectDetail> {
  if (auth.role !== 'admin') {
    throw new ProjectError('Only admins can create projects', 403);
  }
  if (!input.name?.trim()) {
    throw new ProjectError('Project name is required', 400);
  }
  if (!input.vcs?.toolName || !VCS_PROVIDERS.has(input.vcs.toolName)) {
    throw new ProjectError('A valid version control tool (github, gitlab, bitbucket) is required', 400);
  }
  if (!input.vcs.externalProjectId?.trim()) {
    throw new ProjectError('Version control project identifier is required', 400);
  }
  assertConfigForTool(input.vcs.toolName as SupportedTool, input.vcs.config ?? {});

  // Validate every optional integration up front so a bad one never creates-then-rolls-back a project.
  for (const integration of input.integrations ?? []) {
    if (!TOOL_CATEGORIES.has(integration.category) || integration.category === 'vcs') {
      throw new ProjectError(`Invalid tool category: ${integration.category}`, 400);
    }
    if (!integration.toolName || !integration.externalProjectId?.trim()) {
      throw new ProjectError('Each integration needs a toolName and externalProjectId', 400);
    }
    assertToolInCategory(integration.category, integration.toolName);
    assertConfigForTool(integration.toolName, integration.config ?? {});
  }

  const project = await dbCreateProject({
    companyId: auth.companyId,
    name: input.name,
    description: input.description ?? null,
  });

  const pendingInvites: string[] = [];

  try {
    // Version control — the workspace; always exactly one.
    await addIntegration({
      projectId: project.id,
      category: 'vcs',
      toolName: input.vcs.toolName as SupportedTool,
      externalProjectId: input.vcs.externalProjectId,
      config: input.vcs.config ?? {},
    });

    // Other-category tools — optional (already validated above).
    for (const integration of input.integrations ?? []) {
      await addIntegration({
        projectId: project.id,
        category: integration.category,
        toolName: integration.toolName,
        externalProjectId: integration.externalProjectId,
        config: integration.config ?? {},
      });
    }

    // Invites: assign existing company members now; unknown emails get an email invite below.
    // Dedupe emails and track added users so a repeated invitee can't hit the unique constraint.
    const seenEmails = new Set<string>();
    const addedUserIds = new Set<number>();
    for (const rawEmail of input.invites ?? []) {
      const email = rawEmail?.trim().toLowerCase();
      if (!email || seenEmails.has(email)) continue;
      seenEmails.add(email);
      const user = await findUserByEmail(email);
      if (user && user.company_id === auth.companyId) {
        if (!addedUserIds.has(user.id)) {
          await addProjectMember({ projectId: project.id, userId: user.id });
          addedUserIds.add(user.id);
        }
      } else {
        pendingInvites.push(email);
      }
    }
  } catch (error) {
    await deleteProject(project.id);
    log.error({ err: error, projectId: project.id }, 'project creation failed, rolled back');
    throw error;
  }

  // Project committed — email the unknown invitees a registration link (best-effort).
  if (pendingInvites.length > 0) {
    await sendProjectInvites({
      companyId: auth.companyId,
      projectId: project.id,
      projectName: project.name,
      emails: pendingInvites,
    });
  }

  log.info({ projectId: project.id, companyId: auth.companyId }, 'project created');
  return toDetail(project, pendingInvites);
}

// M2.3 — project detail, authorized (company match; non-admins must be assigned).
export async function getProject(auth: Auth, projectId: number): Promise<ProjectDetail> {
  const project = await getProjectById(projectId);
  if (!project) {
    throw new ProjectError('Project not found', 404);
  }
  if (project.company_id !== auth.companyId) {
    throw new ProjectError('You do not have access to this project', 403);
  }
  if (auth.role !== 'admin' && !(await isProjectMember(auth.userId, String(projectId)))) {
    throw new ProjectError('You are not assigned to this project', 403);
  }
  return toDetail(project);
}

// ---- Read-only project + health-score dashboard feed ----
// Maps project + projecthealthscore + snapshot metric tables to the dashboard shape:
// health scores and the six ops-metric cards. Unscoped (no auth) — see authorization.service.ts.

export interface HealthSubscores {
  delivery: number;
  codeQuality: number;
  cicd: number;
  teamHealth: number;
  blockers: number;
}

export interface HealthSeriesPoint {
  date: string;
  label: string;
  score: number;
}

export interface OpsMetrics {
  commits: number | null;
  ticketsClosed: number | null;
  sprintVelocity: number | null;
  openBlockers: number | null;
  deployments: number | null;
  prCycleTime: number | null;
}

export type OpsMetricSeries = Record<
  'commits' | 'tickets' | 'velocity' | 'blockers' | 'deployments' | 'prCycleTime',
  { v: number; label: string; date: string }[]
>;

export interface ProjectHealth {
  id: number;
  name: string;
  owner: string | null;
  repo: string | null;
  team: string;
  description: string;
  score: number | null;
  scoreTrend: number;
  subscores: HealthSubscores | null;
  sparkline: { v: number }[];
  timeSeries: HealthSeriesPoint[];
  subscoreSeries: Record<keyof HealthSubscores, { v: number; label: string; date: string }[]>;
  metrics: OpsMetrics | null;
  metricSeries: OpsMetricSeries;
  pendingSurvey: boolean;
  pendingSurveyTrigger: string | null;
  lastUpdated: string | null;
  /** True once at least one projecthealthscore row exists - lets the frontend distinguish "never synced" from "score is genuinely 0". */
  hasData: boolean;
  /** True once at least one snapshot metric value exists for the ops cards. */
  hasMetrics: boolean;
}

function formatLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function roundMetric(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function lastKnown(rows: SnapshotOpsMetricsRow[], pick: (row: SnapshotOpsMetricsRow) => number | null): number | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const value = pick(rows[index]!);
    if (value !== null) return value;
  }
  return null;
}

function isoDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function carryForwardSeries(
  rows: SnapshotOpsMetricsRow[],
  pick: (row: SnapshotOpsMetricsRow) => number | null,
  decimals = 0,
): { v: number; label: string; date: string }[] {
  let last: number | null = null;
  const series: { v: number; label: string; date: string }[] = [];
  for (const row of rows) {
    const value = pick(row);
    if (value !== null) last = value;
    if (last !== null) {
      series.push({
        v: roundMetric(last, decimals),
        label: formatLabel(row.snapshotTime),
        date: isoDate(row.snapshotTime),
      });
    }
  }
  return series;
}

function buildOpsMetrics(rows: SnapshotOpsMetricsRow[]): { metrics: OpsMetrics | null; metricSeries: OpsMetricSeries; hasMetrics: boolean } {
  const emptySeries: OpsMetricSeries = {
    commits: [],
    tickets: [],
    velocity: [],
    blockers: [],
    deployments: [],
    prCycleTime: [],
  };

  const commits = lastKnown(rows, (row) => row.commits);
  const ticketsClosed = lastKnown(rows, (row) => row.ticketsClosed);
  const sprintVelocity = lastKnown(rows, (row) => row.sprintVelocity);
  const openBlockers = lastKnown(rows, (row) => row.openBlockers);
  const deployments = lastKnown(rows, (row) => row.deployments);
  const prCycleTime = lastKnown(rows, (row) => row.prCycleTime);

  const hasMetrics = [commits, ticketsClosed, sprintVelocity, openBlockers, deployments, prCycleTime].some((value) => value !== null);
  if (!hasMetrics) {
    return { metrics: null, metricSeries: emptySeries, hasMetrics: false };
  }

  return {
    hasMetrics: true,
    metrics: {
      commits: commits === null ? null : roundMetric(commits),
      ticketsClosed: ticketsClosed === null ? null : roundMetric(ticketsClosed),
      sprintVelocity: sprintVelocity === null ? null : roundMetric(sprintVelocity),
      openBlockers: openBlockers === null ? null : roundMetric(openBlockers),
      deployments: deployments === null ? null : roundMetric(deployments),
      prCycleTime: prCycleTime === null ? null : roundMetric(prCycleTime, 1),
    },
    metricSeries: {
      commits: carryForwardSeries(rows, (row) => row.commits),
      tickets: carryForwardSeries(rows, (row) => row.ticketsClosed),
      velocity: carryForwardSeries(rows, (row) => row.sprintVelocity),
      blockers: carryForwardSeries(rows, (row) => row.openBlockers),
      deployments: carryForwardSeries(rows, (row) => row.deployments),
      prCycleTime: carryForwardSeries(rows, (row) => row.prCycleTime, 1),
    },
  };
}

function buildProjectHealth(
  project: ProjectRow,
  history: ProjectHealthScoreRow[],
  opsHistory: SnapshotOpsMetricsRow[],
): ProjectHealth {
  const latest = history[history.length - 1] ?? null;
  const previous = history.length > 1 ? history[history.length - 2] : null;

  const team = project.owner && project.repo ? `${project.owner}/${project.repo}` : (project.owner ?? '');

  const round = (value: number | null | undefined): number => Math.round(value ?? 0);

  const subscores: HealthSubscores | null = latest
    ? {
        delivery: round(latest.delivery_score),
        codeQuality: round(latest.code_quality_score),
        cicd: round(latest.cicd_score),
        teamHealth: round(latest.team_health_score),
        blockers: round(latest.blockers_score),
      }
    : null;

  const score = latest?.overall_score ?? null;
  const scoreTrend = latest && previous && latest.overall_score !== null && previous.overall_score !== null
    ? Math.round((latest.overall_score - previous.overall_score) * 10) / 10
    : 0;

  const sparkline = history.map((h) => ({ v: Math.round(h.overall_score ?? 0) }));
  const timeSeries = history.map((h) => ({
    date: isoDate(h.computed_at),
    label: formatLabel(h.computed_at),
    score: Math.round(h.overall_score ?? 0),
  }));

  const subscoreSeries: Record<keyof HealthSubscores, { v: number; label: string; date: string }[]> = {
    delivery: history.map((h) => ({ v: Math.round(h.delivery_score ?? 0), label: formatLabel(h.computed_at), date: isoDate(h.computed_at) })),
    codeQuality: history.map((h) => ({ v: Math.round(h.code_quality_score ?? 0), label: formatLabel(h.computed_at), date: isoDate(h.computed_at) })),
    cicd: history.map((h) => ({ v: Math.round(h.cicd_score ?? 0), label: formatLabel(h.computed_at), date: isoDate(h.computed_at) })),
    teamHealth: history.map((h) => ({ v: Math.round(h.team_health_score ?? 0), label: formatLabel(h.computed_at), date: isoDate(h.computed_at) })),
    blockers: history.map((h) => ({ v: Math.round(h.blockers_score ?? 0), label: formatLabel(h.computed_at), date: isoDate(h.computed_at) })),
  };

  const ops = buildOpsMetrics(opsHistory);

  return {
    id: project.id,
    name: project.name,
    owner: project.owner,
    repo: project.repo,
    team,
    description: project.description ?? '',
    score: score !== null ? Math.round(score) : null,
    scoreTrend,
    subscores,
    sparkline,
    timeSeries,
    subscoreSeries,
    metrics: ops.metrics,
    metricSeries: ops.metricSeries,
    pendingSurvey: project.pendingSurvey,
    pendingSurveyTrigger: project.pendingSurveyTrigger,
    lastUpdated: latest?.computed_at ?? opsHistory[opsHistory.length - 1]?.snapshotTime ?? null,
    hasData: latest !== null,
    hasMetrics: ops.hasMetrics,
  };
}

export async function listProjectsWithHealth(auth: Auth): Promise<ProjectHealth[]> {
  // Company-scoped feed; members are further narrowed to projects they belong to (mirrors listProjects).
  const allowed =
    auth.role === 'admin'
      ? await listProjectsByCompany(auth.companyId)
      : await listProjectsForMember(auth.companyId, auth.userId);
  const allowedIds = new Set(allowed.map((p) => p.id));
  const projects = (await dbListAllProjects(auth.companyId)).filter((p) => allowedIds.has(p.id));
  return Promise.all(
    projects.map(async (project) => {
      const [history, opsHistory] = await Promise.all([
        listProjectHealthScoreHistory(project.id),
        listProjectOpsMetricsHistory(project.id),
      ]);
      return buildProjectHealth(project, history, opsHistory);
    }),
  );
}

export async function getProjectHealth(auth: Auth, projectId: number): Promise<ProjectHealth | null> {
  const project = await dbGetProjectRow(projectId);
  // Don't leak other companies' projects — treat cross-company as not found.
  if (!project || project.companyId !== auth.companyId) return null;
  const [history, opsHistory] = await Promise.all([
    listProjectHealthScoreHistory(projectId),
    listProjectOpsMetricsHistory(projectId),
  ]);
  return buildProjectHealth(project, history, opsHistory);
}
