/**
 * Jira PM Strategy Implementation
 */

import { IPmStrategy } from './pm-strategy.interface.js';
import { CreatePmStrategyInput } from './types.js';
import { JiraMetricsResponse } from './jira-metrics.types.js';

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
    customfield_10016?: number; // Story points (common custom field)
    duedate: string | null;
    summary: string;
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

export class JiraStrategy implements IPmStrategy {
  private credentials: { token: string; email: string; baseUrl: string };
  private project: { projectKey: string; boardId?: string };

  constructor(input: CreatePmStrategyInput) {
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
  }

  async getData(): Promise<JiraMetricsResponse> {
    const now = new Date();

    // Fetch all required data
    const [issues, sprints, projectInfo] = await Promise.all([
      this.fetchIssues(),
      this.fetchSprints(),
      this.fetchProjectInfo(),
    ]);

    // Calculate metrics
    const sprintCompletionRate = this.calculateSprintCompletionRate(sprints, issues);
    const issueCycleTimeAvgDays = this.calculateIssueCycleTime(issues);
    const throughputPerWeek = this.calculateThroughput(issues);
    const carryoverRate = this.calculateCarryoverRate(sprints, issues);
    const scopeCreepRate = this.calculateScopeCreepRate(sprints, issues);
    const estimationAccuracy = this.calculateEstimationAccuracy(issues);
    const blockedMetrics = this.calculateBlockedMetrics(issues);
    const overdueItemsCount = this.calculateOverdueItems(issues);

    const leadTime = this.calculateLeadTimeMetrics(issues, sprints);
    const spillover = this.calculateSpilloverMetrics(sprints, issues);
    const blockedWork = this.calculateBlockedWorkMetrics(issues);
    const scopeChurn = this.calculateScopeChurnMetrics(sprints, issues);
    const staleTickets = this.calculateStaleTicketsMetrics(issues);

    return {
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
        estimationAccuracy,
        blockedItemsCount: blockedMetrics.count,
        blockedItemsAvgAgeDays: blockedMetrics.avgAgeDays,
        overdueItemsCount,
        leadTime,
        spillover,
        blockedWork,
        scopeChurn,
        staleTickets,
      },
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

  private async fetchIssues(): Promise<JiraIssue[]> {
    const issues: JiraIssue[] = [];
    let startAt = 0;
    const maxResults = PAGE_SIZE;

    // Fetch issues from last 90 days
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    while (true) {
      const jql = `project = ${this.project.projectKey} AND updated >= "${since}" ORDER BY created DESC`;
      const url = `${this.credentials.baseUrl}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}&expand=changelog&fields=created,updated,resolutiondate,status,issuetype,priority,assignee,customfield_10016,duedate,summary`;

      const data = await this.fetchWithAuth(url);
      issues.push(...data.issues);

      if (data.issues.length < maxResults) break;
      startAt += maxResults;

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_PAUSE_MS));
    }

    return issues;
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

  private calculateEstimationAccuracy(issues: JiraIssue[]): number | null {
    // Placeholder: requires time tracking data
    // Would compare original estimate vs actual time spent
    return null;
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
    storyPointSpillover: number | null;
    consecutiveSpilloverCount: number;
    carryoverAvgAgeDays: number | null;
  } {
    if (sprints.length < 2) {
      return {
        spilloverRatio: null,
        storyPointSpillover: null,
        consecutiveSpilloverCount: 0,
        carryoverAvgAgeDays: null,
      };
    }

    const recentSprints = sprints.slice(-3);
    let totalSpillover = 0;
    let totalIssues = 0;
    let consecutiveCount = 0;
    const carryoverAges: number[] = [];

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

      // Calculate carryover age
      incomplete.forEach((issue) => {
        const created = new Date(issue.fields.created).getTime();
        const now = Date.now();
        carryoverAges.push((now - created) / (24 * 60 * 60 * 1000));
      });
    }

    const spilloverRatio = totalIssues > 0 ? Math.round((totalSpillover / totalIssues) * 100) : null;
    const carryoverAvgAgeDays =
      carryoverAges.length > 0
        ? Math.round((carryoverAges.reduce((sum, age) => sum + age, 0) / carryoverAges.length) * 10) / 10
        : null;

    return {
      spilloverRatio,
      storyPointSpillover: null, // Requires story point data
      consecutiveSpilloverCount: consecutiveCount,
      carryoverAvgAgeDays,
    };
  }

  private calculateBlockedWorkMetrics(issues: JiraIssue[]): {
    blockedTicketPercent: number | null;
    avgBlockedDurationDays: number | null;
    maxBlockedDurationDays: number | null;
    blockedReentryCount: number;
  } {
    const blockedIssues = issues.filter((issue) =>
      BLOCKED_STATUS_KEYWORDS.some((keyword) => issue.fields.status.name.toLowerCase().includes(keyword)),
    );

    if (blockedIssues.length === 0) {
      return {
        blockedTicketPercent: 0,
        avgBlockedDurationDays: null,
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

    const avgDuration = durations.reduce((sum, dur) => sum + dur, 0) / durations.length;
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
      avgBlockedDurationDays: Math.round(avgDuration * 10) / 10,
      maxBlockedDurationDays: Math.round(maxDuration * 10) / 10,
      blockedReentryCount: reentryCount,
    };
  }

  private calculateScopeChurnMetrics(
    sprints: JiraSprint[],
    issues: JiraIssue[],
  ): {
    midSprintAdditions: number;
    scopeChurnRatio: number | null;
    priorityChangeCount: number;
    removedScopeRatio: number | null;
  } {
    if (sprints.length === 0) {
      return {
        midSprintAdditions: 0,
        scopeChurnRatio: null,
        priorityChangeCount: 0,
        removedScopeRatio: null,
      };
    }

    const recentSprints = sprints.slice(-3);
    let totalAdded = 0;
    let totalRemoved = 0;
    let totalCommitted = 0;
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
      totalCommitted += sprintIssues.length;

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

    const scopeChurnRatio = totalCommitted > 0 ? Math.round((totalAdded / totalCommitted) * 100) : null;
    const removedScopeRatio = totalCommitted > 0 ? Math.round((totalRemoved / totalCommitted) * 100) : null;

    return {
      midSprintAdditions: totalAdded,
      scopeChurnRatio,
      priorityChangeCount: priorityChanges,
      removedScopeRatio,
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

  private getIssuesInSprint(sprint: JiraSprint, issues: JiraIssue[]): JiraIssue[] {
    if (!sprint.startDate || !sprint.endDate) return [];

    const sprintStart = new Date(sprint.startDate).getTime();
    const sprintEnd = new Date(sprint.endDate).getTime();

    return issues.filter((issue) => {
      const created = new Date(issue.fields.created).getTime();
      const updated = new Date(issue.fields.updated).getTime();

      // Issue was created before sprint ended and updated during or after sprint
      return created <= sprintEnd && updated >= sprintStart;
    });
  }
}
