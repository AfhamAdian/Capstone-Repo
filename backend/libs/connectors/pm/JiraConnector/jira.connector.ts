/**
 * Jira PM Connector Implementation
 */

import { IPmConnector } from '../connector.interface.js';
import { CreatePmConnectorInput } from '../types.js';
import { JiraMetricsResponse } from '../jira-metrics.types.js';
import type { IConnector, ConnectorOutput } from '@libs/sync/index.js';

// Jira API types
interface JiraIssue {
  id: string;
  key: string;
  fields: {
    created: string;
    updated: string;
    resolutiondate: string | null;
    status: {
      name: string;
      statusCategory: { key: string };
    };
    issuetype: { name: string };
    priority: { name: string } | null;
    assignee: { displayName: string } | null;
    duedate: string | null;
    summary: string;
    parent?: { id: string; key: string }; // Epic linkage on team-managed projects
    [key: string]: unknown; // instance-specific custom fields (story points, Epic Link) keyed dynamically
  };
  changelog?: {
    histories: Array<{
      created: string;
      items: Array<{
        field: string;
        fromString: string | null;
        toString: string | null;
      }>;
    }>;
  };
}

interface JiraSprint {
  id: number;
  name: string;
  state: 'active' | 'closed' | 'future';
  startDate?: string;
  endDate?: string;
  completeDate?: string;
}

const RATE_LIMIT_PAUSE_MS = 1000;
const PAGE_SIZE = 100;
const STALE_DAYS_THRESHOLD = 14;
const BLOCKED_STATUS_KEYWORDS = ['blocked', 'impediment', 'waiting'];
const DEFAULT_STORY_POINTS_FIELD_KEY = 'customfield_10016';
const DEFAULT_EPIC_LINK_FIELD_KEY = 'customfield_10014';

export class JiraConnector implements IPmConnector, IConnector {
  private credentials: { token: string; email: string; baseUrl: string };
  private project: { projectKey: string; boardId?: string };
  private options: { storyPointsFieldKey: string; epicLinkFieldKey: string };

  constructor(input: CreatePmConnectorInput) {
    if (!input.credentials.token) {
      throw new Error('Jira token is required');
    }
    if (!input.credentials.email) {
      throw new Error('Jira email is required for authentication');
    }
    if (!input.project.projectKey) {
      throw new Error('Jira project key is required');
    }

    const baseUrl = input.credentials.baseUrl || 'https://your-domain.atlassian.net';

    this.credentials = {
      token: input.credentials.token,
      email: input.credentials.email,
      baseUrl: baseUrl.replace(/\/$/, ''), // Remove trailing slash
    };

    this.project = {
      projectKey: input.project.projectKey,
      boardId: input.project.boardId,
    };

    this.options = {
      storyPointsFieldKey: input.options?.storyPointsFieldKey ?? DEFAULT_STORY_POINTS_FIELD_KEY,
      epicLinkFieldKey: input.options?.epicLinkFieldKey ?? DEFAULT_EPIC_LINK_FIELD_KEY,
    };
  }

  private getStoryPoints(issue: JiraIssue): number {
    const raw = issue.fields[this.options.storyPointsFieldKey];
    return typeof raw === 'number' ? raw : 0;
  }

  private getEpicKey(issue: JiraIssue): string | null {
    if (issue.fields.parent?.key) return issue.fields.parent.key; // team-managed
    const raw = issue.fields[this.options.epicLinkFieldKey];
    return typeof raw === 'string' ? raw : null; // company-managed
  }

  async getData(): Promise<ConnectorOutput> {
    const now = new Date();

    // Fetch all required data
    const [issues, sprints, projectInfo, epics] = await Promise.all([
      this.fetchIssues(),
      this.fetchSprints(),
      this.fetchProjectInfo(),
      this.fetchEpics(),
    ]);

    // Calculate metrics
    const sprintCompletionRate = this.calculateSprintCompletionRate(sprints, issues);
    const issueCycleTimeAvgDays = this.calculateIssueCycleTime(issues);
    const throughputPerWeek = this.calculateThroughput(issues);
    const carryoverRate = this.calculateCarryoverRate(sprints, issues);
    const scopeCreepRate = this.calculateScopeCreepRate(sprints, issues);
    const blockedMetrics = this.calculateBlockedMetrics(issues);
    const overdueItemsCount = this.calculateOverdueItems(issues);
    const storyPointSayDoRatio = this.calculateStoryPointSayDoRatio(sprints, issues);
    const epicCompletionRatePercent = this.calculateEpicCompletionRate(epics, issues);

    const leadTime = this.calculateLeadTimeMetrics(issues, sprints);
    const spillover = this.calculateSpilloverMetrics(sprints, issues);
    const blockedWork = this.calculateBlockedWorkMetrics(issues);
    const scopeChurn = this.calculateScopeChurnMetrics(sprints, issues);
    const staleTickets = this.calculateStaleTicketsMetrics(issues);

    const metrics: JiraMetricsResponse = {
      generatedAt: now.toISOString(),
      project: {
        key: projectInfo.key,
        id: projectInfo.id,
        name: projectInfo.name,
      },
      metrics: {
        sprintCompletionRate,
        issueCycleTimeAvgDays,
        throughputPerWeek,
        carryoverRate,
        scopeCreepRate,
        blockedItemsCount: blockedMetrics.count,
        blockedItemsAvgAgeDays: blockedMetrics.avgAgeDays,
        overdueItemsCount,
        storyPointSayDoRatio,
        epicCompletionRatePercent,
        leadTime,
        spillover,
        blockedWork,
        scopeChurn,
        staleTickets,
      },
    };

    return {
      tool: 'jira',
      provider: 'jira',
      data: metrics,
      fetchedAt: now,
    };
  }

  private async fetchWithAuth(url: string): Promise<any> {
    const auth = Buffer.from(`${this.credentials.email}:${this.credentials.token}`).toString('base64');

    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jira API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  private async fetchProjectInfo(): Promise<{ key: string; id: string; name: string }> {
    const url = `${this.credentials.baseUrl}/rest/api/3/project/${this.project.projectKey}`;
    const data = await this.fetchWithAuth(url);
    return {
      key: data.key,
      id: data.id,
      name: data.name,
    };
  }

  private issueFields(): string {
    return [
      'created',
      'updated',
      'resolutiondate',
      'status',
      'issuetype',
      'priority',
      'assignee',
      'duedate',
      'summary',
      'parent',
      this.options.storyPointsFieldKey,
      this.options.epicLinkFieldKey,
    ].join(',');
  }

  private async fetchIssues(): Promise<JiraIssue[]> {
    const issues: JiraIssue[] = [];
    let startAt = 0;
    const maxResults = PAGE_SIZE;

    // Fetch issues from last 90 days
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    while (true) {
      const jql = `project = ${this.project.projectKey} AND updated >= "${since}" ORDER BY created DESC`;
      const url = `${this.credentials.baseUrl}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}&expand=changelog&fields=${this.issueFields()}`;

      const data = await this.fetchWithAuth(url);
      issues.push(...data.issues);

      if (data.issues.length < maxResults) break;
      startAt += maxResults;

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_PAUSE_MS));
    }

    return issues;
  }

  /**
   * Epics are fetched separately, with no recency filter — unlike fetchIssues(), which only
   * looks at the last 90 days. Epics are coarse-grained (far fewer than regular issues) and can
   * span much longer than 90 days without being "updated", so bounding this fetch the same way
   * risks missing an epic whose children are recent but the epic itself is old.
   */
  private async fetchEpics(): Promise<JiraIssue[]> {
    const epics: JiraIssue[] = [];
    let startAt = 0;
    const maxResults = PAGE_SIZE;

    while (true) {
      const jql = `project = ${this.project.projectKey} AND issuetype = Epic ORDER BY created DESC`;
      const url = `${this.credentials.baseUrl}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}&fields=status,summary`;

      const data = await this.fetchWithAuth(url);
      epics.push(...data.issues);

      if (data.issues.length < maxResults) break;
      startAt += maxResults;

      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_PAUSE_MS));
    }

    return epics;
  }

  private async fetchSprints(): Promise<JiraSprint[]> {
    if (!this.project.boardId) {
      return [];
    }

    try {
      const sprints: JiraSprint[] = [];
      let startAt = 0;
      const maxResults = 50;

      while (true) {
        const url = `${this.credentials.baseUrl}/rest/agile/1.0/board/${this.project.boardId}/sprint?startAt=${startAt}&maxResults=${maxResults}`;

        const data = await this.fetchWithAuth(url);
        sprints.push(...data.values);

        if (data.isLast) break;
        startAt += maxResults;

        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_PAUSE_MS));
      }

      return sprints.filter((s) => s.state === 'closed').slice(-10); // Last 10 closed sprints
    } catch (error) {
      // Board doesn't support sprints (e.g., Kanban board)
      return [];
    }
  }

  private calculateSprintCompletionRate(sprints: JiraSprint[], issues: JiraIssue[]): number | null {
    if (sprints.length === 0) return null;

    const recentSprints = sprints.slice(-3); // Last 3 sprints
    let totalCommitted = 0;
    let totalCompleted = 0;

    for (const sprint of recentSprints) {
      const sprintIssues = this.getIssuesInSprint(sprint, issues);
      const completed = sprintIssues.filter((i) => i.fields.status.statusCategory.key === 'done');

      totalCommitted += sprintIssues.length;
      totalCompleted += completed.length;
    }

    return totalCommitted > 0 ? Math.round((totalCompleted / totalCommitted) * 100) : null;
  }

  private calculateStoryPointSayDoRatio(sprints: JiraSprint[], issues: JiraIssue[]): number | null {
    if (sprints.length === 0) return null;

    const recentSprints = sprints.slice(-3); // Last 3 sprints
    let totalCommittedPoints = 0;
    let totalCompletedPoints = 0;

    for (const sprint of recentSprints) {
      const sprintIssues = this.getIssuesInSprint(sprint, issues);

      for (const issue of sprintIssues) {
        const points = this.getStoryPoints(issue);
        totalCommittedPoints += points;
        if (issue.fields.status.statusCategory.key === 'done') {
          totalCompletedPoints += points;
        }
      }
    }

    return totalCommittedPoints > 0 ? Math.round((totalCompletedPoints / totalCommittedPoints) * 100) : null;
  }

  private calculateEpicCompletionRate(epics: JiraIssue[], issues: JiraIssue[]): number | null {
    if (epics.length === 0) return null;

    const perEpicCompletionPercents: number[] = [];

    for (const epic of epics) {
      const children = issues.filter((issue) => this.getEpicKey(issue) === epic.key);
      if (children.length === 0) continue;

      const done = children.filter((issue) => issue.fields.status.statusCategory.key === 'done');
      perEpicCompletionPercents.push((done.length / children.length) * 100);
    }

    if (perEpicCompletionPercents.length === 0) return null;

    const avg =
      perEpicCompletionPercents.reduce((sum, percent) => sum + percent, 0) / perEpicCompletionPercents.length;
    return Math.round(avg);
  }

  private calculateIssueCycleTime(issues: JiraIssue[]): number | null {
    const closedIssues = issues.filter((i) => i.fields.resolutiondate);

    if (closedIssues.length === 0) return null;

    const cycleTimes = closedIssues.map((issue) => {
      const created = new Date(issue.fields.created).getTime();
      const resolved = new Date(issue.fields.resolutiondate!).getTime();
      return (resolved - created) / (24 * 60 * 60 * 1000); // Days
    });

    const avg = cycleTimes.reduce((sum, time) => sum + time, 0) / cycleTimes.length;
    return Math.round(avg * 10) / 10;
  }

  private calculateThroughput(issues: JiraIssue[]): number {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const closedLastWeek = issues.filter((i) => {
      if (!i.fields.resolutiondate) return false;
      return new Date(i.fields.resolutiondate).getTime() > oneWeekAgo;
    });

    return closedLastWeek.length;
  }

  private calculateCarryoverRate(sprints: JiraSprint[], issues: JiraIssue[]): number | null {
    if (sprints.length < 2) return null;

    const recentSprints = sprints.slice(-3);
    let totalCarryover = 0;
    let totalIssues = 0;

    for (let i = 0; i < recentSprints.length - 1; i++) {
      const currentSprint = recentSprints[i];
      const nextSprint = recentSprints[i + 1];

      if (!currentSprint || !nextSprint) continue;

      const currentIssues = this.getIssuesInSprint(currentSprint, issues);
      const incomplete = currentIssues.filter((issue) => issue.fields.status.statusCategory.key !== 'done');

      const nextIssues = this.getIssuesInSprint(nextSprint, issues);
      const carriedOver = incomplete.filter((issue) => nextIssues.some((ni) => ni.key === issue.key));

      totalCarryover += carriedOver.length;
      totalIssues += currentIssues.length;
    }

    return totalIssues > 0 ? Math.round((totalCarryover / totalIssues) * 100) : null;
  }

  private calculateScopeCreepRate(sprints: JiraSprint[], issues: JiraIssue[]): number | null {
    if (sprints.length === 0) return null;

    const recentSprints = sprints.slice(-3);
    let totalAdded = 0;
    let totalCommitted = 0;

    for (const sprint of recentSprints) {
      if (!sprint.startDate) continue;

      const sprintStart = new Date(sprint.startDate).getTime();
      const sprintIssues = this.getIssuesInSprint(sprint, issues);

      const addedMidSprint = sprintIssues.filter((issue) => {
        const created = new Date(issue.fields.created).getTime();
        return created > sprintStart;
      });

      totalAdded += addedMidSprint.length;
      totalCommitted += sprintIssues.length;
    }

    return totalCommitted > 0 ? Math.round((totalAdded / totalCommitted) * 100) : null;
  }

  private calculateBlockedMetrics(issues: JiraIssue[]): { count: number; avgAgeDays: number | null } {
    const blockedIssues = issues.filter((issue) =>
      BLOCKED_STATUS_KEYWORDS.some((keyword) => issue.fields.status.name.toLowerCase().includes(keyword)),
    );

    if (blockedIssues.length === 0) {
      return { count: 0, avgAgeDays: null };
    }

    const now = Date.now();
    const ages = blockedIssues.map((issue) => {
      const updated = new Date(issue.fields.updated).getTime();
      return (now - updated) / (24 * 60 * 60 * 1000);
    });

    const avgAge = ages.reduce((sum, age) => sum + age, 0) / ages.length;

    return {
      count: blockedIssues.length,
      avgAgeDays: Math.round(avgAge * 10) / 10,
    };
  }

  private calculateOverdueItems(issues: JiraIssue[]): number {
    const now = Date.now();
    return issues.filter((issue) => {
      if (!issue.fields.duedate) return false;
      if (issue.fields.status.statusCategory.key === 'done') return false;
      return new Date(issue.fields.duedate).getTime() < now;
    }).length;
  }

  private calculateLeadTimeMetrics(
    issues: JiraIssue[],
    sprints: JiraSprint[],
  ): {
    avgDays: number | null;
    medianDays: number | null;
    p95Days: number | null;
    variance: number | null;
    trendAcrossSprints: Array<{ sprintName: string; avgLeadTimeDays: number }>;
  } {
    const closedIssues = issues.filter((i) => i.fields.resolutiondate);

    if (closedIssues.length === 0) {
      return {
        avgDays: null,
        medianDays: null,
        p95Days: null,
        variance: null,
        trendAcrossSprints: [],
      };
    }

    const leadTimes = closedIssues.map((issue) => {
      const created = new Date(issue.fields.created).getTime();
      const resolved = new Date(issue.fields.resolutiondate!).getTime();
      return (resolved - created) / (24 * 60 * 60 * 1000);
    });

    leadTimes.sort((a, b) => a - b);

    const avg = leadTimes.reduce((sum, time) => sum + time, 0) / leadTimes.length;
    const median = leadTimes[Math.floor(leadTimes.length / 2)] || 0;
    const p95 = leadTimes[Math.floor(leadTimes.length * 0.95)] || 0;

    const variance =
      leadTimes.reduce((sum, time) => sum + Math.pow(time - avg, 2), 0) / leadTimes.length;

    // Trend across sprints
    const trendAcrossSprints = sprints.slice(-5).map((sprint) => {
      const sprintIssues = this.getIssuesInSprint(sprint, closedIssues);
      const sprintLeadTimes = sprintIssues.map((issue) => {
        const created = new Date(issue.fields.created).getTime();
        const resolved = new Date(issue.fields.resolutiondate!).getTime();
        return (resolved - created) / (24 * 60 * 60 * 1000);
      });

      const avgLeadTime =
        sprintLeadTimes.length > 0
          ? sprintLeadTimes.reduce((sum, time) => sum + time, 0) / sprintLeadTimes.length
          : 0;

      return {
        sprintName: sprint.name,
        avgLeadTimeDays: Math.round(avgLeadTime * 10) / 10,
      };
    });

    return {
      avgDays: Math.round(avg * 10) / 10,
      medianDays: Math.round(median * 10) / 10,
      p95Days: Math.round(p95 * 10) / 10,
      variance: Math.round(variance * 10) / 10,
      trendAcrossSprints,
    };
  }

  private calculateSpilloverMetrics(
    sprints: JiraSprint[],
    issues: JiraIssue[],
  ): {
    spilloverRatio: number | null;
    consecutiveSpilloverCount: number;
    carryoverAvgSprintsSurvived: number | null;
  } {
    if (sprints.length < 2) {
      return {
        spilloverRatio: null,
        consecutiveSpilloverCount: 0,
        carryoverAvgSprintsSurvived: null,
      };
    }

    const recentSprints = sprints.slice(-3);
    let totalSpillover = 0;
    let totalIssues = 0;
    let consecutiveCount = 0;

    for (let i = 0; i < recentSprints.length - 1; i++) {
      const currentSprint = recentSprints[i];
      if (!currentSprint) continue;

      const currentIssues = this.getIssuesInSprint(currentSprint, issues);
      const incomplete = currentIssues.filter((issue) => issue.fields.status.statusCategory.key !== 'done');

      if (incomplete.length > 0) {
        consecutiveCount++;
      } else {
        consecutiveCount = 0;
      }

      totalSpillover += incomplete.length;
      totalIssues += currentIssues.length;
    }

    const spilloverRatio = totalIssues > 0 ? Math.round((totalSpillover / totalIssues) * 100) : null;
    const carryoverAvgSprintsSurvived = this.calculateCarryoverSprintsSurvived(sprints, issues);

    return {
      spilloverRatio,
      consecutiveSpilloverCount: consecutiveCount,
      carryoverAvgSprintsSurvived,
    };
  }

  /**
   * For tickets still incomplete as of the most recent closed sprint (the "currently carried
   * over" population), counts how many consecutive sprints — walking backward through the full
   * retained closed-sprint history, not just the last 3 — each has appeared in without being
   * marked Done. Averaged across that population.
   *
   * Note: sprint membership is determined by getIssuesInSprint()'s date-range heuristic
   * (created/updated overlapping the sprint's date window), not Jira's actual Sprint field —
   * see future-work.md for the known limitation this inherits.
   */
  private calculateCarryoverSprintsSurvived(sprints: JiraSprint[], issues: JiraIssue[]): number | null {
    if (sprints.length < 2) return null;

    const lastSprint = sprints[sprints.length - 1];
    if (!lastSprint) return null;

    const lastSprintIssues = this.getIssuesInSprint(lastSprint, issues);
    const stillIncomplete = lastSprintIssues.filter((issue) => issue.fields.status.statusCategory.key !== 'done');

    if (stillIncomplete.length === 0) return null;

    const survivalCounts = stillIncomplete.map((issue) => {
      let streak = 0;
      for (let idx = sprints.length - 1; idx >= 0; idx--) {
        const sprint = sprints[idx];
        if (!sprint) break;
        const sprintIssues = this.getIssuesInSprint(sprint, issues);
        const inSprint = sprintIssues.some((si) => si.key === issue.key);
        if (!inSprint) break;
        streak++;
      }
      return streak;
    });

    const avg = survivalCounts.reduce((sum, count) => sum + count, 0) / survivalCounts.length;
    return Math.round(avg * 10) / 10;
  }

  private calculateBlockedWorkMetrics(issues: JiraIssue[]): {
    blockedTicketPercent: number | null;
    maxBlockedDurationDays: number | null;
    blockedReentryCount: number;
  } {
    const blockedIssues = issues.filter((issue) =>
      BLOCKED_STATUS_KEYWORDS.some((keyword) => issue.fields.status.name.toLowerCase().includes(keyword)),
    );

    if (blockedIssues.length === 0) {
      return {
        blockedTicketPercent: 0,
        maxBlockedDurationDays: null,
        blockedReentryCount: 0,
      };
    }

    const blockedPercent = Math.round((blockedIssues.length / issues.length) * 100);

    const now = Date.now();
    const durations = blockedIssues.map((issue) => {
      const updated = new Date(issue.fields.updated).getTime();
      return (now - updated) / (24 * 60 * 60 * 1000);
    });

    const maxDuration = Math.max(...durations);

    // Count re-entry (issues that were blocked, unblocked, then blocked again)
    let reentryCount = 0;
    blockedIssues.forEach((issue) => {
      if (!issue.changelog) return;

      let blockedCount = 0;
      issue.changelog.histories.forEach((history) => {
        history.items.forEach((item) => {
          if (item.field === 'status' && item.toString) {
            if (BLOCKED_STATUS_KEYWORDS.some((keyword) => item.toString!.toLowerCase().includes(keyword))) {
              blockedCount++;
            }
          }
        });
      });

      if (blockedCount > 1) reentryCount++;
    });

    return {
      blockedTicketPercent: blockedPercent,
      maxBlockedDurationDays: Math.round(maxDuration * 10) / 10,
      blockedReentryCount: reentryCount,
    };
  }

  private calculateScopeChurnMetrics(
    sprints: JiraSprint[],
    issues: JiraIssue[],
  ): {
    midSprintAdditions: number;
    priorityChangeCount: number;
  } {
    if (sprints.length === 0) {
      return {
        midSprintAdditions: 0,
        priorityChangeCount: 0,
      };
    }

    const recentSprints = sprints.slice(-3);
    let totalAdded = 0;
    let priorityChanges = 0;

    for (const sprint of recentSprints) {
      if (!sprint.startDate) continue;

      const sprintStart = new Date(sprint.startDate).getTime();
      const sprintIssues = this.getIssuesInSprint(sprint, issues);

      const addedMidSprint = sprintIssues.filter((issue) => {
        const created = new Date(issue.fields.created).getTime();
        return created > sprintStart;
      });

      totalAdded += addedMidSprint.length;

      // Count priority changes
      sprintIssues.forEach((issue) => {
        if (!issue.changelog) return;

        issue.changelog.histories.forEach((history) => {
          const historyTime = new Date(history.created).getTime();
          if (historyTime < sprintStart) return;

          history.items.forEach((item) => {
            if (item.field === 'priority') {
              priorityChanges++;
            }
          });
        });
      });
    }

    return {
      midSprintAdditions: totalAdded,
      priorityChangeCount: priorityChanges,
    };
  }

  private calculateStaleTicketsMetrics(issues: JiraIssue[]): {
    inProgressAvgAgeDays: number | null;
    staleTicketRatio: number | null;
    stateMovementCount: number;
  } {
    const inProgressIssues = issues.filter(
      (issue) => issue.fields.status.statusCategory.key === 'indeterminate',
    );

    if (inProgressIssues.length === 0) {
      return {
        inProgressAvgAgeDays: null,
        staleTicketRatio: null,
        stateMovementCount: 0,
      };
    }

    const now = Date.now();
    const ages = inProgressIssues.map((issue) => {
      const updated = new Date(issue.fields.updated).getTime();
      return (now - updated) / (24 * 60 * 60 * 1000);
    });

    const avgAge = ages.reduce((sum, age) => sum + age, 0) / ages.length;
    const staleCount = ages.filter((age) => age > STALE_DAYS_THRESHOLD).length;
    const staleRatio = Math.round((staleCount / inProgressIssues.length) * 100);

    // Count state movements
    let stateMovements = 0;
    inProgressIssues.forEach((issue) => {
      if (!issue.changelog) return;

      issue.changelog.histories.forEach((history) => {
        history.items.forEach((item) => {
          if (item.field === 'status') {
            stateMovements++;
          }
        });
      });
    });

    return {
      inProgressAvgAgeDays: Math.round(avgAge * 10) / 10,
      staleTicketRatio: staleRatio,
      stateMovementCount: stateMovements,
    };
  }

  // created/updated are parsed once per issue instead of twice per membership test.
  // calculateCarryoverSprintsSurvived alone used to re-parse the whole issue list once
  // per (incomplete issue x sprint) pair, which on a busy project ran into millions of
  // Date allocations on the worker's only thread.
  private issueTimesCache = new WeakMap<JiraIssue, { created: number; updated: number }>();

  private getIssueTimes(issue: JiraIssue): { created: number; updated: number } {
    const cached = this.issueTimesCache.get(issue);
    if (cached) return cached;

    const times = {
      created: new Date(issue.fields.created).getTime(),
      updated: new Date(issue.fields.updated).getTime(),
    };
    this.issueTimesCache.set(issue, times);
    return times;
  }

  // Keyed on the sprint AND the array identity: calculateLeadTimeMetrics passes a
  // filtered `closedIssues` array while every other caller passes the full set, so a
  // cache keyed on sprint id alone would hand the lead-time path the wrong population.
  private sprintMembershipCache = new WeakMap<JiraIssue[], Map<number, JiraIssue[]>>();

  private getIssuesInSprint(sprint: JiraSprint, issues: JiraIssue[]): JiraIssue[] {
    let bySprintId = this.sprintMembershipCache.get(issues);
    if (!bySprintId) {
      bySprintId = new Map<number, JiraIssue[]>();
      this.sprintMembershipCache.set(issues, bySprintId);
    }

    const cached = bySprintId.get(sprint.id);
    if (cached) return cached;

    const members = this.computeIssuesInSprint(sprint, issues);
    bySprintId.set(sprint.id, members);
    return members;
  }

  private computeIssuesInSprint(sprint: JiraSprint, issues: JiraIssue[]): JiraIssue[] {
    if (!sprint.startDate || !sprint.endDate) return [];

    const sprintStart = new Date(sprint.startDate).getTime();
    const sprintEnd = new Date(sprint.endDate).getTime();

    return issues.filter((issue) => {
      const { created, updated } = this.getIssueTimes(issue);

      // Issue was created before sprint ended and updated during or after sprint
      return created <= sprintEnd && updated >= sprintStart;
    });
  }
}
