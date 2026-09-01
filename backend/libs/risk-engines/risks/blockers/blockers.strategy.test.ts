import { describe, it, expect } from 'vitest';
import { RiskType } from '../../types.js';
import { BlockersStrategy } from './blockers.strategy.js';

describe('BlockersStrategy', () => {
  it('reports its risk type', () => {
    expect(new BlockersStrategy().getType()).toBe(RiskType.BLOCKERS);
  });

  // Unlike every other strategy, this one is NOT a renormalized weighted average -
  // missing metrics default to 0 (= "no blockers") rather than being excluded, so an
  // empty input scores 100, not 0. That asymmetry is exactly what this test locks in.
  it('scores an empty input as a perfect 100 (missing = no blockers, not "unknown")', () => {
    const result = new BlockersStrategy().calculate({});
    expect(result.score).toBe(100);
    expect(result.level).toBe('HIGH');
    expect(result.weights).toEqual([
      { key: 'blockedItemsScore', w: 0.5 },
      { key: 'overdueItemsScore', w: 0.5 },
    ]);
  });

  it('combines the blocked-items and overdue-items formulas 50/50', () => {
    const result = new BlockersStrategy().calculate({
      blockedItemsCount: 10,
      blockedItemsAvgAgeDays: 4,
      overdueItemsCount: 5,
    });
    // blockedItemsScore = 100 - (10*2 + 4*1.5) = 74
    // overdueItemsScore = 100 - 5*3 = 85
    // score = 74*0.5 + 85*0.5 = 79.5
    expect(result.score).toBe(79.5);
    expect(result.level).toBe('HIGH');
  });

  it('floors each side at 0 instead of going negative', () => {
    const result = new BlockersStrategy().calculate({
      blockedItemsCount: 100,
      overdueItemsCount: 100,
    });
    expect(result.score).toBe(0);
    expect(result.level).toBe('LOW');
  });

  it('buckets a mid-range score as MEDIUM', () => {
    // overdueItemsScore = 100 - 15*3 = 55; blockedItemsScore = 100 (all blocked fields 0).
    // score = 100*0.5 + 55*0.5 = 77.5 -> still HIGH, so push further: 25 overdue items.
    const result = new BlockersStrategy().calculate({ overdueItemsCount: 25 });
    // overdueItemsScore = max(100 - 75, 0) = 25; score = 100*0.5 + 25*0.5 = 62.5
    expect(result.score).toBe(62.5);
    expect(result.level).toBe('MEDIUM');
  });
});
