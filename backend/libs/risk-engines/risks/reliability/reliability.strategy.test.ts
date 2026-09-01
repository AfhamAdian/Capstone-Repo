import { describe, it, expect } from 'vitest';
import { RiskType } from '../../types.js';
import { ReliabilityStrategy } from './reliability.strategy.js';

describe('ReliabilityStrategy', () => {
  it('reports its risk type', () => {
    expect(new ReliabilityStrategy().getType()).toBe(RiskType.RELIABILITY);
  });

  it('scores every signal at its best as a perfect 100', () => {
    const result = new ReliabilityStrategy().calculate({
      reliabilityRating: 1,
      testFailureRatePercent: 0,
      coverage: 100,
      flakyTestCount: 0,
      newCoverage: 100,
      issueReopenRatePercent: 0,
      mrRevertRatePercent: 0,
      qualityGatePassRatePercent: 100,
      reliabilityRemediationEffort: 60,
      newBugs: 0,
    });
    expect(result.score).toBe(100);
    expect(result.level).toBe('HIGH');
    expect(result.weights).toEqual([
      { key: 'reliabilityRating', w: 0.3 },
      { key: 'testFailureRate', w: 0.15 },
      { key: 'coverageOverall', w: 0.14 },
      { key: 'flakyTestCount', w: 0.1 },
      { key: 'coverageNewCode', w: 0.09 },
      { key: 'issueReopenRate', w: 0.08 },
      { key: 'mrRevertRate', w: 0.08 },
      { key: 'qualityGatePassRate', w: 0.04 },
      { key: 'reliabilityRemediationEffort', w: 0.02 },
    ]);
  });

  it('scores every signal at its worst as 0, floored (not negative) after the new-bug penalty', () => {
    const result = new ReliabilityStrategy().calculate({
      reliabilityRating: 5,
      testFailureRatePercent: 20,
      coverage: 0,
      flakyTestCount: 20,
      newCoverage: 0,
      issueReopenRatePercent: 30,
      mrRevertRatePercent: 20,
      qualityGatePassRatePercent: 0,
      reliabilityRemediationEffort: 2400,
      newBugs: 20,
    });
    expect(result.score).toBe(0);
    expect(result.level).toBe('LOW');
  });

  it('renormalizes around whatever signal is actually present', () => {
    const result = new ReliabilityStrategy().calculate({ reliabilityRating: 1 });
    expect(result.score).toBe(100);
    expect(result.weights).toEqual([{ key: 'reliabilityRating', w: 1 }]);
  });

  it('subtracts 2 points per new bug from the base score', () => {
    const clean = new ReliabilityStrategy().calculate({ reliabilityRating: 1, newBugs: 0 });
    const withThree = new ReliabilityStrategy().calculate({ reliabilityRating: 1, newBugs: 3 });
    expect(clean.score - withThree.score).toBe(6);
  });

  it('caps the new-bug penalty at 15 points', () => {
    const result = new ReliabilityStrategy().calculate({ reliabilityRating: 1, newBugs: 10 });
    expect(result.score).toBe(85);
  });

  it('returns a 0 score with no contributing weights when every signal is absent', () => {
    const result = new ReliabilityStrategy().calculate({});
    expect(result.score).toBe(0);
    expect(result.level).toBe('LOW');
    expect(result.weights).toEqual([]);
  });
});
