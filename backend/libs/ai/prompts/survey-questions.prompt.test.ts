import { describe, expect, it } from 'vitest';
import { formatSurveyHealthContext, formatSurveyIncidents, rankProblemMetrics } from './survey-questions.prompt.js';
import type { SurveyHealthContext, SurveyIncidentSignals } from '../types.js';

const incidents: SurveyIncidentSignals = {
  snapshotId: 12,
  snapshotTime: '2026-08-18T00:00:00.000Z',
  spilloverRatio: 0.4,
  consecutiveSpilloverCount: 2,
  blockedItemsCount: 3,
  overdueItemsCount: 0,
  scopeChurnRatio: 0.2,
  midSprintAdditions: 5,
  deploymentsPerWeek: 2,
  deploymentFailureRatePercent: 50,
  pipelineSuccessRatePercent: 80,
  stalePrCount: 4,
  prCycleTimeHours: 18.2,
  commitsPerWeek: 12,
};

describe('formatSurveyIncidents', () => {
  it('turns last-cycle metrics into situation lines without ids or people', () => {
    const lines = formatSurveyIncidents(incidents);
    expect(lines.some((line) => line.includes('40% of committed sprint work'))).toBe(true);
    expect(lines.some((line) => line.includes('2 consecutive sprints'))).toBe(true);
    expect(lines.some((line) => line.includes('5 tickets were added'))).toBe(true);
    expect(lines.some((line) => line.includes('3 tickets are currently blocked'))).toBe(true);
    expect(lines.some((line) => line.includes('4 pull requests have gone stale'))).toBe(true);
    expect(lines.some((line) => line.includes('18 hours'))).toBe(true);
    expect(lines.some((line) => line.includes('2 deployments'))).toBe(true);
    expect(lines.some((line) => line.includes('50% of recent deployments failed'))).toBe(true);
    expect(lines.join(' ')).not.toMatch(/#\d+|@|ticket-id/i);
  });

  it('omits empty or zero-noise signals', () => {
    const lines = formatSurveyIncidents({
      ...incidents,
      blockedItemsCount: 0,
      overdueItemsCount: 0,
      stalePrCount: 0,
      midSprintAdditions: 0,
      scopeChurnRatio: 0,
      deploymentFailureRatePercent: 0,
    });
    expect(lines.some((line) => line.includes('blocked'))).toBe(false);
    expect(lines.some((line) => line.includes('stale'))).toBe(false);
  });
});

describe('formatSurveyHealthContext', () => {
  it('appends incident lines so question generation can target this cycle', () => {
    const context: SurveyHealthContext = {
      capturedAt: '2026-08-18T00:00:00.000Z',
      overallScore: 22,
      scores: { security: 25, reliability: 20, maintainability: 15, cicdDeploymentHealth: 18, teamHealth: 28, engineeringProcess: 22, planningExecution: 20 },
      metricsSnapshotId: 12,
      source: 'risk_score',
      incidents,
    };
    const text = formatSurveyHealthContext(context);
    expect(text).toContain('Recent incidents from the last sync');
    expect(text).toContain('40% of committed sprint work');
    expect(text).toContain('Overall: 22.0');
  });
});

describe('rankProblemMetrics', () => {
  const signal = (label: string, score: number | null, weight: number) => ({
    key: label,
    label,
    score,
    weight,
    metricFields: [`${label}Field`],
    metricValues: [1],
  });

  it('ranks unhealthy metrics by weight × shortfall and skips healthy or missing ones', () => {
    const ranked = rankProblemMetrics({
      engineeringProcess: [
        signal('Self-merged PR rate', 0, 0.12),
        signal('Commit message quality', 0, 0.02),
        signal('Review iteration count', 100, 0.03),
      ],
      reliability: [signal('Reliability rating', 50, 0.6), signal('Flaky test count', null, 0.2)],
    });
    expect(ranked.map((p) => p.label)).toEqual(['Reliability rating', 'Self-merged PR rate', 'Commit message quality']);
    expect(ranked[0]!.raw).toBe('Reliability ratingField=1');
  });

  it('puts the ranked list into the health context text', () => {
    const text = formatSurveyHealthContext({
      capturedAt: '2026-08-18T00:00:00.000Z',
      overallScore: 50,
      scores: { security: 50, reliability: 50, maintainability: 50, cicdDeploymentHealth: 50, teamHealth: 50, engineeringProcess: 50, planningExecution: 50 },
      metricsSnapshotId: 12,
      source: 'risk_score',
      breakdown: { engineeringProcess: [signal('Self-merged PR rate', 0, 0.12)] },
    });
    expect(text).toContain('Top problem metrics');
    expect(text).toContain('1. [engineeringProcess] Self-merged PR rate');
  });
});
