import { describe, it, expect } from 'vitest';
import { RiskType } from '../../types.js';
import { EngineeringProcessStrategy } from './engineering-process.strategy.js';

describe('EngineeringProcessStrategy', () => {
  it('reports its risk type', () => {
    expect(new EngineeringProcessStrategy().getType()).toBe(RiskType.ENGINEERING_PROCESS);
  });

  it('scores a project clean across both sub-groups as a perfect 100, blending them 50/50', () => {
    const result = new EngineeringProcessStrategy().calculate({
      // Sub-group A: Review Quality
      selfMergedPrRatePercent: 0,
      prReviewCoveragePercent: 100,
      timeToFirstReviewHours: 2,
      unresolvedThreadsAtMergeCount: 0,
      mrMergeTimeHours: 4,
      reviewCommentsPerMrAvg: 3,
      reviewCommentsPer100LinesAvg: 2,
      reviewIterationCount: 1,
      longLivedBranchesCount: 0,
      commitMessageQualityPercent: 100,
      avgPipelineRunsPerPr: 1,
      // Sub-group B: Flow/Bottleneck
      blockedTicketPercent: 0,
      leadTimeAvgDays: 1,
      blockedItemsAvgAgeDays: 1,
      staleIssuesCount: 0,
      staleMrsCount: 0,
      staleTicketRatio: 0,
      overdueItemsCount: 0,
      blockedReentryCount: 0,
      blockedItemsCount: 0,
    });
    expect(result.score).toBe(100);
    expect(result.level).toBe('HIGH');
    // Both sub-groups contributed, prefixed and re-weighted to their 50% share.
    expect(result.weights.filter((w) => w.key.startsWith('reviewQuality.'))).toHaveLength(10);
    expect(result.weights.filter((w) => w.key.startsWith('flowBottleneck.'))).toHaveLength(7);
  });

  it('scores a project at its worst across both sub-groups as 0', () => {
    const result = new EngineeringProcessStrategy().calculate({
      selfMergedPrRatePercent: 40,
      prReviewCoveragePercent: 0,
      timeToFirstReviewHours: 48,
      unresolvedThreadsAtMergeCount: 10,
      mrMergeTimeHours: 72,
      reviewCommentsPerMrAvg: 100, // far outside the banded tolerance
      reviewIterationCount: 6,
      longLivedBranchesCount: 15,
      commitMessageQualityPercent: 0,
      avgPipelineRunsPerPr: 6,
      blockedTicketPercent: 40,
      leadTimeAvgDays: 14,
      blockedItemsAvgAgeDays: 14,
      staleIssuesCount: 20,
      overdueItemsCount: 10,
      blockedReentryCount: 5,
      blockedItemsCount: 20,
    });
    expect(result.score).toBe(0);
    expect(result.level).toBe('LOW');
  });

  it('falls back to sub-group A alone, unhalved and unprefixed, when B has no data at all', () => {
    const result = new EngineeringProcessStrategy().calculate({ selfMergedPrRatePercent: 0 });
    expect(result.score).toBe(100);
    expect(result.weights).toEqual([{ key: 'selfMergedPrRate', w: 1 }]);
  });

  it('falls back to sub-group B alone, unhalved and unprefixed, when A has no data at all', () => {
    const result = new EngineeringProcessStrategy().calculate({ blockedTicketPercent: 0 });
    expect(result.score).toBe(100);
    expect(result.weights).toEqual([{ key: 'blockedTicketRatio', w: 1 }]);
  });

  it('prefers leadTimeAvgDays over issueCycleTimeDays when both are present', () => {
    // If issueCycleTimeDays were used instead, this would score 0, not 100.
    const result = new EngineeringProcessStrategy().calculate({
      leadTimeAvgDays: 1, // good
      issueCycleTimeDays: 14, // bad - must be ignored
    });
    expect(result.score).toBe(100);
  });

  it('falls back to issueCycleTimeDays when leadTimeAvgDays is absent', () => {
    const result = new EngineeringProcessStrategy().calculate({ issueCycleTimeDays: 1 });
    expect(result.score).toBe(100);
  });

  it('averages the per-MR and per-100-lines review-comment signals when both are present', () => {
    // per-MR (8) is far outside its band -> 0; per-100-lines (2) is exactly ideal -> 100. Average: 50.
    const result = new EngineeringProcessStrategy().calculate({
      reviewCommentsPerMrAvg: 8,
      reviewCommentsPer100LinesAvg: 2,
    });
    expect(result.score).toBe(50);
  });

  it('averages only the stale signals that are present, not treating missing ones as 0', () => {
    // staleIssuesCount (20, bad) -> 0; staleTicketRatio (0, good) -> 100; staleMrsCount absent.
    // Averaging only the two present signals gives 50, not (0+100+0)/3.
    const result = new EngineeringProcessStrategy().calculate({
      staleIssuesCount: 20,
      staleTicketRatio: 0,
    });
    expect(result.score).toBe(50);
  });

  it('returns a 0 score with no contributing weights when every signal is absent', () => {
    const result = new EngineeringProcessStrategy().calculate({});
    expect(result.score).toBe(0);
    expect(result.level).toBe('LOW');
    expect(result.weights).toEqual([]);
  });
});
