import { describe, it, expect } from 'vitest';
import { RiskType } from '../../types.js';
import { CicdDeploymentHealthStrategy } from './cicd-deployment-health.strategy.js';

describe('CicdDeploymentHealthStrategy', () => {
  it('reports its risk type', () => {
    expect(new CicdDeploymentHealthStrategy().getType()).toBe(RiskType.CICD_DEPLOYMENT_HEALTH);
  });

  it('scores every signal at its best as a perfect 100', () => {
    const result = new CicdDeploymentHealthStrategy().calculate({
      deploymentFailureRatePercent: 0,
      mttrHours: 1,
      timeToProdHours: 24,
      deploymentsPerWeek: 7,
      pipelineSuccessRatePercent: 100,
      avgPipelineDurationMinutes: 10,
    });
    expect(result.score).toBe(100);
    expect(result.level).toBe('HIGH');
    expect(result.weights).toEqual([
      { key: 'deploymentFailureRate', w: 0.25 },
      { key: 'mttr', w: 0.2 },
      { key: 'changeLeadTime', w: 0.2 },
      { key: 'deploymentFrequency', w: 0.15 },
      { key: 'pipelineSuccessRate', w: 0.15 },
      { key: 'pipelineDuration', w: 0.05 },
    ]);
  });

  it('scores every signal at its worst as 0', () => {
    const result = new CicdDeploymentHealthStrategy().calculate({
      deploymentFailureRatePercent: 30,
      mttrHours: 48,
      timeToProdHours: 720,
      deploymentsPerWeek: 0,
      pipelineSuccessRatePercent: 0,
      avgPipelineDurationMinutes: 60,
    });
    expect(result.score).toBe(0);
    expect(result.level).toBe('LOW');
  });

  it('caps deployment frequency at 100 once the weekly target is reached', () => {
    const atTarget = new CicdDeploymentHealthStrategy().calculate({ deploymentsPerWeek: 7 });
    const doubleTarget = new CicdDeploymentHealthStrategy().calculate({ deploymentsPerWeek: 14 });
    expect(atTarget.score).toBe(100);
    expect(doubleTarget.score).toBe(100);
  });

  it('renormalizes around whatever signal is actually present', () => {
    const result = new CicdDeploymentHealthStrategy().calculate({ pipelineSuccessRatePercent: 80 });
    expect(result.score).toBe(80);
    expect(result.weights).toEqual([{ key: 'pipelineSuccessRate', w: 1 }]);
  });

  it('returns a 0 score with no contributing weights when every signal is absent', () => {
    const result = new CicdDeploymentHealthStrategy().calculate({});
    expect(result.score).toBe(0);
    expect(result.level).toBe('LOW');
    expect(result.weights).toEqual([]);
  });
});
