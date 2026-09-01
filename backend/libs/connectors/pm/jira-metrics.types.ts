/**
 * Jira metrics return types
 */

export interface JiraMetricsResponse {
  generatedAt: string;
  project: {
    key: string;
    id: string;
    name: string;
  };
  metrics: {
    // Delivery Velocity
    sprintCompletionRate: number | null; // Percentage
    issueCycleTimeAvgDays: number | null;
    throughputPerWeek: number;
    carryoverRate: number | null; // Percentage
    scopeCreepRate: number | null; // Percentage
    blockedItemsCount: number;
    blockedItemsAvgAgeDays: number | null;
    overdueItemsCount: number;
    storyPointSayDoRatio: number | null; // Percentage — completed vs. committed story points
    epicCompletionRatePercent: number | null; // Percentage — avg child-issue completion across epics

    // Lead Time Metrics
    leadTime: {
      avgDays: number | null;
      medianDays: number | null;
      p95Days: number | null;
      variance: number | null;
      trendAcrossSprints: Array<{ sprintName: string; avgLeadTimeDays: number }>;
    };

    // Sprint Spillover
    spillover: {
      spilloverRatio: number | null; // Percentage
      consecutiveSpilloverCount: number;
      carryoverAvgSprintsSurvived: number | null; // Avg consecutive sprints a currently carried-over ticket has persisted
    };

    // Blocked Work
    blockedWork: {
      blockedTicketPercent: number | null;
      maxBlockedDurationDays: number | null;
      blockedReentryCount: number;
    };

    // Scope Churn
    scopeChurn: {
      midSprintAdditions: number;
      priorityChangeCount: number;
    };

    // Stale Tickets
    staleTickets: {
      inProgressAvgAgeDays: number | null;
      staleTicketRatio: number | null; // Percentage
      stateMovementCount: number;
    };
  };
}
