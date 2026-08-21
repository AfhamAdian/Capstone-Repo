/**
 * Seeds the Jira project from .env with connector test data: issues across
 * all statuses, due dates, a blocked re-entry, 3 closed sprints + 1 active.
 * Timestamps are "now" (API can't backdate), so time-based metrics read ~0.
 * Run: npx tsx scripts/seed-jira.ts
 */

import 'dotenv/config';

const BASE_URL = (process.env.JIRA_BASE_URL ?? '').replace(/\/$/, '');
const EMAIL = process.env.JIRA_EMAIL ?? '';
const TOKEN = process.env.JIRA_TOKEN ?? '';
const PROJECT_KEY = process.env.JIRA_PROJECT_KEY ?? 'SCRUM';
const BOARD_ID = process.env.JIRA_BOARD_ID ?? '1';

if (!BASE_URL || !EMAIL || !TOKEN) {
  console.error('Missing JIRA_BASE_URL / JIRA_EMAIL / JIRA_TOKEN in .env');
  process.exit(1);
}

const AUTH = Buffer.from(`${EMAIL}:${TOKEN}`).toString('base64');
const DAY_MS = 24 * 60 * 60 * 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function jira(path: string, method = 'GET', body?: unknown): Promise<any> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${AUTH}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${method} ${path} -> ${response.status}: ${text}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function dueDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * DAY_MS).toISOString().split('T')[0]!;
}

interface IssueSpec {
  summary: string;
  type: 'Task' | 'Story' | 'Bug';
  targetStatus: 'Done' | 'In Progress' | 'In Review' | 'Blocked' | null; // null = stay in To Do
  dueOffsetDays?: number; // negative = overdue
  blockedReentry?: boolean;
  changePriority?: boolean;
}

const ISSUE_SPECS: IssueSpec[] = [
  // 10 Done -> completion rate, throughput, cycle/lead time
  { summary: 'Implement login flow', type: 'Story', targetStatus: 'Done' },
  { summary: 'Fix session timeout bug', type: 'Bug', targetStatus: 'Done' },
  { summary: 'Add project list endpoint', type: 'Task', targetStatus: 'Done' },
  { summary: 'Set up CI pipeline', type: 'Task', targetStatus: 'Done', changePriority: true },
  { summary: 'Design dashboard layout', type: 'Story', targetStatus: 'Done' },
  { summary: 'Migrate database schema', type: 'Task', targetStatus: 'Done' },
  { summary: 'Fix broken pagination', type: 'Bug', targetStatus: 'Done' },
  { summary: 'Add password reset email', type: 'Story', targetStatus: 'Done' },
  { summary: 'Refactor metrics service', type: 'Task', targetStatus: 'Done' },
  { summary: 'Write onboarding docs', type: 'Task', targetStatus: 'Done' },
  // 5 In Progress -> WIP / stale-ticket metrics
  { summary: 'Build risk score charts', type: 'Story', targetStatus: 'In Progress' },
  { summary: 'Integrate SonarQube connector', type: 'Task', targetStatus: 'In Progress', changePriority: true },
  { summary: 'Optimize sync worker', type: 'Task', targetStatus: 'In Progress' },
  { summary: 'Fix flaky SSE reconnect', type: 'Bug', targetStatus: 'In Progress', dueOffsetDays: -3 },
  { summary: 'Add project settings page', type: 'Story', targetStatus: 'In Progress' },
  // 2 In Review
  { summary: 'Team health metrics endpoint', type: 'Task', targetStatus: 'In Review' },
  { summary: 'Refactor connector registry', type: 'Task', targetStatus: 'In Review' },
  // 3 Blocked (one with re-entry) -> blocked count/duration/re-entry
  { summary: 'Waiting on API rate-limit increase', type: 'Task', targetStatus: 'Blocked' },
  { summary: 'Blocked on infra access for deploy', type: 'Task', targetStatus: 'Blocked', dueOffsetDays: -5 },
  { summary: 'Third-party SDK licensing approval', type: 'Story', targetStatus: 'Blocked', blockedReentry: true },
  // 4 To Do (2 overdue, 2 future) -> overdue items
  { summary: 'Add e2e tests for sync flow', type: 'Task', targetStatus: null, dueOffsetDays: -7 },
  { summary: 'Upgrade Express to v5', type: 'Task', targetStatus: null, dueOffsetDays: -2, changePriority: true },
  { summary: 'Evaluate LLM assistant design', type: 'Story', targetStatus: null, dueOffsetDays: 7 },
  { summary: 'Add GitLab connector', type: 'Story', targetStatus: null, dueOffsetDays: 14 },
];

async function createIssue(spec: IssueSpec): Promise<string> {
  const fields: Record<string, unknown> = {
    project: { key: PROJECT_KEY },
    summary: spec.summary,
    issuetype: { name: spec.type },
  };
  if (spec.dueOffsetDays !== undefined) {
    fields.duedate = dueDate(spec.dueOffsetDays);
  }

  const created = await jira('/rest/api/3/issue', 'POST', { fields });
  return created.key as string;
}

async function transitionTo(issueKey: string, statusName: string): Promise<void> {
  const data = await jira(`/rest/api/3/issue/${issueKey}/transitions`);
  const transition = (data.transitions as Array<{ id: string; to: { name: string } }>).find(
    (t) => t.to.name.toLowerCase() === statusName.toLowerCase(),
  );
  if (!transition) {
    throw new Error(`No transition to "${statusName}" for ${issueKey}`);
  }
  await jira(`/rest/api/3/issue/${issueKey}/transitions`, 'POST', {
    transition: { id: transition.id },
  });
}

async function tryChangePriority(issueKey: string): Promise<boolean> {
  try {
    await jira(`/rest/api/3/issue/${issueKey}`, 'PUT', { fields: { priority: { name: 'High' } } });
    return true;
  } catch {
    return false; // team-managed projects often reject priority edits via API
  }
}

async function closeActiveSprints(): Promise<void> {
  const data = await jira(`/rest/agile/1.0/board/${BOARD_ID}/sprint?state=active`).catch(() => null);
  for (const sprint of data?.values ?? []) {
    console.log(`   closing pre-existing active sprint "${sprint.name}" (${sprint.id})`);
    await jira(`/rest/agile/1.0/sprint/${sprint.id}`, 'POST', { state: 'closed' });
  }
}

async function createCycledSprint(
  name: string,
  startOffsetDays: number,
  issueKeys: string[],
  close: boolean,
): Promise<void> {
  const startDate = new Date(Date.now() + startOffsetDays * DAY_MS).toISOString();
  const endDate = new Date(Date.now() + 1 * DAY_MS).toISOString();

  const sprint = await jira('/rest/agile/1.0/sprint', 'POST', {
    name,
    originBoardId: Number(BOARD_ID),
    startDate,
    endDate,
  });

  if (issueKeys.length > 0) {
    await jira(`/rest/agile/1.0/sprint/${sprint.id}/issue`, 'POST', { issues: issueKeys });
  }

  await jira(`/rest/agile/1.0/sprint/${sprint.id}`, 'POST', { state: 'active', startDate, endDate });
  if (close) {
    await jira(`/rest/agile/1.0/sprint/${sprint.id}`, 'POST', { state: 'closed' });
  }
  console.log(`   sprint "${name}" ${close ? 'created + closed' : 'created + left active'} (${issueKeys.length} issues)`);
}

async function main() {
  console.log(`Seeding ${BASE_URL} project=${PROJECT_KEY} board=${BOARD_ID}\n`);

  console.log('1) Creating %d issues...', ISSUE_SPECS.length);
  const keysBySpec: Array<{ key: string; spec: IssueSpec }> = [];
  for (const spec of ISSUE_SPECS) {
    const key = await createIssue(spec);
    keysBySpec.push({ key, spec });
    console.log(`   ${key}  ${spec.type.padEnd(5)}  ${spec.summary}`);
    await sleep(120);
  }

  console.log('\n2) Transitioning statuses...');
  for (const { key, spec } of keysBySpec) {
    if (!spec.targetStatus) continue;
    if (spec.blockedReentry) {
      await transitionTo(key, 'Blocked');
      await transitionTo(key, 'In Progress');
      await transitionTo(key, 'Blocked');
      console.log(`   ${key} -> Blocked -> In Progress -> Blocked (re-entry)`);
    } else {
      await transitionTo(key, spec.targetStatus);
      console.log(`   ${key} -> ${spec.targetStatus}`);
    }
    await sleep(120);
  }

  console.log('\n3) Priority changes (best effort)...');
  let priorityChanged = 0;
  for (const { key, spec } of keysBySpec) {
    if (spec.changePriority && (await tryChangePriority(key))) {
      priorityChanged += 1;
      console.log(`   ${key} priority -> High`);
    }
  }
  if (priorityChanged === 0) {
    console.log('   (priority edits rejected by site — priorityChangeCount will stay 0, fine)');
  }

  console.log('\n4) Sprints...');
  await closeActiveSprints();

  const allKeys = keysBySpec.map((entry) => entry.key);
  const doneKeys = keysBySpec.filter((e) => e.spec.targetStatus === 'Done').map((e) => e.key);
  const openKeys = allKeys.filter((key) => !doneKeys.includes(key));

  // Three closed sprints with windows overlapping now (issues are matched to
  // sprints by time overlap in the connector). Mixed done/open per sprint.
  await createCycledSprint('Seed Sprint 1', -21, [...doneKeys.slice(0, 4), ...openKeys.slice(0, 3)], true);
  await createCycledSprint('Seed Sprint 2', -14, [...doneKeys.slice(4, 7), ...openKeys.slice(3, 7)], true);
  await createCycledSprint('Seed Sprint 3', -7, [...doneKeys.slice(7, 10), ...openKeys.slice(7, 11)], true);
  // Current active sprint with the remaining open work.
  await createCycledSprint('Current Sprint', 0, openKeys.slice(0, 8), false);

  console.log('\nDONE. Seeded %d issues + 3 closed sprints + 1 active sprint.', allKeys.length);
  process.exit(0);
}

main().catch((error) => {
  console.error('\nSEED FAILED:', error?.message ?? error);
  process.exit(1);
});
