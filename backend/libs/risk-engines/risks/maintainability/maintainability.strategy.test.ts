import { describe, it, expect } from 'vitest';
import { RiskType } from '../../types.js';
import { MaintainabilityStrategy } from './maintainability.strategy.js';

describe('MaintainabilityStrategy', () => {
  it('reports its risk type', () => {
    expect(new MaintainabilityStrategy().getType()).toBe(RiskType.MAINTAINABILITY);
  });

  it('scores every signal at its best as a perfect 100', () => {
    const result = new MaintainabilityStrategy().calculate({
      maintainabilityRating: 1,
      linesOfCode: 10000,
      codeSmells: 0,
      cyclomaticComplexity: 100,
      cognitiveComplexity: 50,
      duplicatedLinesDensity: 3,
      newDuplicatedLinesDensity: 3,
      hotspotFilesWorstOffenders: [],
      codeChurnHighFrequencyFilesCount: 0,
      dependencyUpdateLagDays: 7,
      newTechnicalDebt: 0,
      newCodeSmells: 0,
    });
    expect(result.score).toBe(100);
    expect(result.level).toBe('HIGH');
    expect(result.weights).toEqual([
      { key: 'maintainabilityRating', w: 0.3 },
      { key: 'codeSmellsDensity', w: 0.15 },
      { key: 'cyclomaticComplexity', w: 0.1 },
      { key: 'cognitiveComplexity', w: 0.1 },
      { key: 'duplicatedCode', w: 0.1 },
      { key: 'duplicatedLinesNewCode', w: 0.05 },
      { key: 'codeChurnDensity', w: 0.08 },
      { key: 'hotspotFilesDensity', w: 0.07 },
      { key: 'dependencyUpdateLag', w: 0.05 },
    ]);
  });

  it('scores every signal at its worst as 0, floored after the new-debt/new-smells penalty', () => {
    const result = new MaintainabilityStrategy().calculate({
      maintainabilityRating: 5,
      linesOfCode: 1000,
      codeSmells: 1000,
      cyclomaticComplexity: 5000,
      cognitiveComplexity: 3000,
      duplicatedLinesDensity: 30,
      newDuplicatedLinesDensity: 30,
      hotspotFilesWorstOffenders: [{ file: 'a.ts', hotspotCount: 1000 }],
      codeChurnHighFrequencyFilesCount: 1000,
      dependencyUpdateLagDays: 90,
      newTechnicalDebt: 1000,
      newCodeSmells: 10,
    });
    expect(result.score).toBe(0);
    expect(result.level).toBe('LOW');
  });

  it('renormalizes around whatever signal is actually present', () => {
    const result = new MaintainabilityStrategy().calculate({ maintainabilityRating: 1 });
    expect(result.score).toBe(100);
    expect(result.weights).toEqual([{ key: 'maintainabilityRating', w: 1 }]);
  });

  it('does not compute a density signal without linesOfCode', () => {
    const withCounts = new MaintainabilityStrategy().calculate({
      maintainabilityRating: 1,
      codeSmells: 999,
      codeChurnHighFrequencyFilesCount: 999,
      hotspotFilesWorstOffenders: [{ file: 'a.ts', hotspotCount: 999 }],
    });
    const without = new MaintainabilityStrategy().calculate({ maintainabilityRating: 1 });
    expect(withCounts.score).toBe(without.score);
    expect(withCounts.weights).toEqual([{ key: 'maintainabilityRating', w: 1 }]);
  });

  it('sums newTechnicalDebt minutes and newCodeSmells count into one penalty, capped at 15', () => {
    const base = new MaintainabilityStrategy().calculate({ maintainabilityRating: 1 });
    const withDebt = new MaintainabilityStrategy().calculate({ maintainabilityRating: 1, newTechnicalDebt: 500 });
    expect(base.score - withDebt.score).toBe(10); // 500 * 0.02

    const capped = new MaintainabilityStrategy().calculate({ maintainabilityRating: 1, newCodeSmells: 20 });
    expect(capped.score).toBe(85); // 20 * 1 = 20, capped at 15
  });

  it('returns a 0 score with no contributing weights when every signal is absent', () => {
    const result = new MaintainabilityStrategy().calculate({});
    expect(result.score).toBe(0);
    expect(result.level).toBe('LOW');
    expect(result.weights).toEqual([]);
  });
});
