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
    estimationAccuracy: number | null; // Percentage
    blockedItemsCount: number;
    blockedItemsAvgAgeDays: number | null;
    overdueItemsCount: number;

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
      storyPointSpillover: number | null;
      consecutiveSpilloverCount: number;
      carryoverAvgAgeDays: number | null;
    };

    // Blocked Work
    blockedWork: {
      blockedTicketPercent: number | null;
      avgBlockedDurationDays: number | null;
      maxBlockedDurationDays: number | null;
      blockedReentryCount: number;
    };

    // Scope Churn
    scopeChurn: {
      midSprintAdditions: number;
      scopeChurnRatio: number | null; // Percentage
      priorityChangeCount: number;
      removedScopeRatio: number | null; // Percentage
    };

    // Stale Tickets
    staleTickets: {
      inProgressAvgAgeDays: number | null;
      staleTicketRatio: number | null; // Percentage
      stateMovementCount: number;
    };
  };
}
