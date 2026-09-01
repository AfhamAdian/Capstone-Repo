import { describe, it, expect } from 'vitest';
import { RiskType } from '../../types.js';
import { TeamHealthStrategy } from './team-health.strategy.js';

describe('TeamHealthStrategy', () => {
  it('reports its risk type', () => {
    expect(new TeamHealthStrategy().getType()).toBe(RiskType.TEAM_HEALTH);
  });

  it('scores every signal at its best as a perfect 100', () => {
    const result = new TeamHealthStrategy().calculate({
      busFactor: 5,
      codeOwnershipConcentrationPercent: 20,
      reviewNetworkDensityPercent: 100,
      activeContributionsPerWeek: 5,
    });
    expect(result.score).toBe(100);
    expect(result.level).toBe('HIGH');
    expect(result.weights).toEqual([
      { key: 'busFactor', w: 0.35 },
      { key: 'ownershipConcentration', w: 0.3 },
      { key: 'reviewNetworkDensity', w: 0.25 },
      { key: 'activeContributors', w: 0.1 },
    ]);
  });

  it('scores every signal at its worst as 0', () => {
    const result = new TeamHealthStrategy().calculate({
      busFactor: 0,
      codeOwnershipConcentrationPercent: 80,
      reviewNetworkDensityPercent: 0,
      activeContributionsPerWeek: 0,
    });
    expect(result.score).toBe(0);
    expect(result.level).toBe('LOW');
  });

  it('caps bus factor and active contributors at 100 once their target is reached', () => {
    expect(new TeamHealthStrategy().calculate({ busFactor: 10 }).score).toBe(100);
    expect(new TeamHealthStrategy().calculate({ activeContributionsPerWeek: 10 }).score).toBe(100);
  });

  it('renormalizes around whatever signal is actually present', () => {
    const result = new TeamHealthStrategy().calculate({ reviewNetworkDensityPercent: 60 });
    expect(result.score).toBe(60);
    expect(result.weights).toEqual([{ key: 'reviewNetworkDensity', w: 1 }]);
  });

  it('returns a 0 score with no contributing weights when every signal is absent', () => {
    const result = new TeamHealthStrategy().calculate({});
    expect(result.score).toBe(0);
    expect(result.level).toBe('LOW');
    expect(result.weights).toEqual([]);
  });
});
