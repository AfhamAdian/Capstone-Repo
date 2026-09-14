import { RiskType } from './types.js';

/**
 * Human-readable label + the raw input metric field(s) behind each strategy's signal `key`
 * (the `weights[].key` a strategy returns - see each risks/<name>/*.strategy.ts). Purely
 * descriptive: used by the score-breakdown feature to show what a score was actually built
 * from, not by the scoring math itself.
 *
 * ENGINEERING_PROCESS and PLANNING_EXECUTION prefix their keys with the sub-group name
 * ("reviewQuality.", "flowBottleneck.", "planningAccuracy.", "deliveryFocus.") only when both
 * sub-groups are present for that snapshot - describeSignal() strips a known prefix before
 * looking the key up here, so entries are keyed by the bare signal name either way.
 */
type SignalInfo = { label: string; metricFields: string[] };

const CATALOG: Record<RiskType, Record<string, SignalInfo>> = {
  [RiskType.SECURITY]: {
    securityRating: { label: 'Security rating', metricFields: ['securityRating'] },
    vulnCountDensity: { label: 'Vulnerability density', metricFields: ['securityVulnerabilityCount', 'linesOfCode'] },
    securityReviewRating: { label: 'Security review rating', metricFields: ['securityReviewRating'] },
    securityHotspotsDensity: { label: 'Security hotspot density', metricFields: ['securityHotspots', 'linesOfCode'] },
    dependencyUpdateLag: { label: 'Dependency update lag', metricFields: ['dependencyUpdateLagDays'] },
    securityRemediationEffort: { label: 'Security remediation effort', metricFields: ['securityRemediationEffort'] },
  },
  [RiskType.RELIABILITY]: {
    reliabilityRating: { label: 'Reliability rating', metricFields: ['reliabilityRating'] },
    testFailureRate: { label: 'Test failure rate', metricFields: ['testFailureRatePercent'] },
    coverageOverall: { label: 'Test coverage', metricFields: ['coverage'] },
    flakyTestCount: { label: 'Flaky test count', metricFields: ['flakyTestCount'] },
    coverageNewCode: { label: 'Coverage on new code', metricFields: ['newCoverage'] },
    issueReopenRate: { label: 'Issue reopen rate', metricFields: ['issueReopenRatePercent'] },
    mrRevertRate: { label: 'PR revert rate', metricFields: ['mrRevertRatePercent'] },
    qualityGatePassRate: { label: 'Quality gate pass rate', metricFields: ['qualityGatePassRatePercent'] },
    reliabilityRemediationEffort: { label: 'Reliability remediation effort', metricFields: ['reliabilityRemediationEffort'] },
  },
  [RiskType.MAINTAINABILITY]: {
    maintainabilityRating: { label: 'Maintainability rating', metricFields: ['maintainabilityRating'] },
    codeSmellsDensity: { label: 'Code smells density', metricFields: ['codeSmells', 'linesOfCode'] },
    cyclomaticComplexity: { label: 'Cyclomatic complexity', metricFields: ['cyclomaticComplexity'] },
    cognitiveComplexity: { label: 'Cognitive complexity', metricFields: ['cognitiveComplexity'] },
    duplicatedCode: { label: 'Duplicated code', metricFields: ['duplicatedLinesDensity'] },
    duplicatedLinesNewCode: { label: 'Duplicated lines in new code', metricFields: ['newDuplicatedLinesDensity'] },
    codeChurnDensity: { label: 'Code churn density', metricFields: ['codeChurnHighFrequencyFilesCount', 'linesOfCode'] },
    hotspotFilesDensity: { label: 'Hotspot files density', metricFields: ['hotspotFilesWorstOffenders', 'linesOfCode'] },
    dependencyUpdateLag: { label: 'Dependency update lag', metricFields: ['dependencyUpdateLagDays'] },
  },
  [RiskType.CICD_DEPLOYMENT_HEALTH]: {
    deploymentFailureRate: { label: 'Deployment failure rate', metricFields: ['deploymentFailureRatePercent'] },
    mttr: { label: 'Mean time to recovery', metricFields: ['mttrHours'] },
    changeLeadTime: { label: 'Change lead time', metricFields: ['timeToProdHours'] },
    deploymentFrequency: { label: 'Deployment frequency', metricFields: ['deploymentsPerWeek'] },
    pipelineSuccessRate: { label: 'Pipeline success rate', metricFields: ['pipelineSuccessRatePercent'] },
    pipelineDuration: { label: 'Pipeline duration', metricFields: ['avgPipelineDurationMinutes'] },
  },
  [RiskType.TEAM_HEALTH]: {
    busFactor: { label: 'Bus factor', metricFields: ['busFactor'] },
    ownershipConcentration: { label: 'Code ownership concentration', metricFields: ['codeOwnershipConcentrationPercent'] },
    reviewNetworkDensity: { label: 'Review network density', metricFields: ['reviewNetworkDensityPercent'] },
    activeContributors: { label: 'Active contributors per week', metricFields: ['activeContributionsPerWeek'] },
  },
  [RiskType.ENGINEERING_PROCESS]: {
    selfMergedPrRate: { label: 'Self-merged PR rate', metricFields: ['selfMergedPrRatePercent'] },
    prReviewCoverage: { label: 'PR review coverage', metricFields: ['prReviewCoveragePercent'] },
    timeToFirstReview: { label: 'Time to first review', metricFields: ['timeToFirstReviewHours'] },
    unresolvedThreadsAtMerge: { label: 'Unresolved threads at merge', metricFields: ['unresolvedThreadsAtMergeCount'] },
    mrMergeTime: { label: 'PR merge time', metricFields: ['mrMergeTimeHours'] },
    reviewCommentsBanded: { label: 'Review comments per PR', metricFields: ['reviewCommentsPerMrAvg', 'reviewCommentsPer100LinesAvg'] },
    reviewIterationCount: { label: 'Review iteration count', metricFields: ['reviewIterationCount'] },
    longLivedBranchCount: { label: 'Long-lived branches', metricFields: ['longLivedBranchesCount'] },
    commitMessageQuality: { label: 'Commit message quality', metricFields: ['commitMessageQualityPercent'] },
    avgPipelineRunsPerPr: { label: 'Pipeline runs per PR', metricFields: ['avgPipelineRunsPerPr'] },
    blockedTicketRatio: { label: 'Blocked ticket ratio', metricFields: ['blockedTicketPercent'] },
    issueCycleTimeOrLeadTime: { label: 'Issue cycle / lead time', metricFields: ['leadTimeAvgDays', 'issueCycleTimeDays'] },
    blockedItemsAvgAge: { label: 'Blocked items average age', metricFields: ['blockedItemsAvgAgeDays'] },
    staleCombined: { label: 'Stale issues, PRs & tickets', metricFields: ['staleIssuesCount', 'staleMrsCount', 'staleTicketRatio'] },
    overdueItems: { label: 'Overdue items', metricFields: ['overdueItemsCount'] },
    blockedReentryCount: { label: 'Blocked re-entry count', metricFields: ['blockedReentryCount'] },
    blockedItemsCount: { label: 'Blocked items count', metricFields: ['blockedItemsCount'] },
  },
  [RiskType.PLANNING_EXECUTION]: {
    sprintCompletionRate: { label: 'Sprint completion rate', metricFields: ['sprintCompletionRate'] },
    scopeCreepRate: { label: 'Scope creep rate', metricFields: ['scopeCreepRate'] },
    storyPointSayDoRatio: { label: 'Story point say/do ratio', metricFields: ['storyPointSayDoRatio'] },
    carryoverRate: { label: 'Carryover rate', metricFields: ['carryoverRate'] },
    spilloverRatio: { label: 'Spillover ratio', metricFields: ['spilloverRatio'] },
    midSprintAdditions: { label: 'Mid-sprint additions', metricFields: ['midSprintAdditions'] },
    consecutiveSpilloverCount: { label: 'Consecutive spillover count', metricFields: ['consecutiveSpilloverCount'] },
    carryoverAvgSprintsSurvived: { label: 'Carryover sprints survived', metricFields: ['carryoverAvgSprintsSurvived'] },
    priorityChangeCount: { label: 'Priority change count', metricFields: ['priorityChangeCount'] },
    epicCompletionRate: { label: 'Epic completion rate', metricFields: ['epicCompletionRatePercent'] },
    throughputPerWeek: { label: 'Throughput per week', metricFields: ['throughputPerWeek'] },
    bugVsFeatureRatio: { label: 'Bug vs. feature ratio', metricFields: ['bugVsFeatureRatio'] },
  },
  // BLOCKERS is the legacy survey-rubric score, not part of the health-score model this
  // feature describes - no signal catalog entries needed.
  [RiskType.BLOCKERS]: {},
};

const SUBGROUP_PREFIXES = ['reviewQuality.', 'flowBottleneck.', 'planningAccuracy.', 'deliveryFocus.'];

/** Strips a known ENGINEERING_PROCESS/PLANNING_EXECUTION sub-group prefix, if present. */
function stripSubgroupPrefix(key: string): string {
  const prefix = SUBGROUP_PREFIXES.find((p) => key.startsWith(p));
  return prefix ? key.slice(prefix.length) : key;
}

export function describeSignal(type: RiskType, key: string): SignalInfo {
  const bareKey = stripSubgroupPrefix(key);
  return CATALOG[type][bareKey] ?? { label: bareKey, metricFields: [] };
}
