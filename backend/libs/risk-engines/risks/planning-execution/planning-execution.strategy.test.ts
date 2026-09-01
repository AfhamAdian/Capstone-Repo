import { describe, it, expect } from 'vitest';
import { RiskType } from '../../types.js';
import { PlanningExecutionStrategy } from './planning-execution.strategy.js';

describe('PlanningExecutionStrategy', () => {
  it('reports its risk type', () => {
    expect(new PlanningExecutionStrategy().getType()).toBe(RiskType.PLANNING_EXECUTION);
  });

  it('scores a project clean across both sub-groups as a perfect 100, blending them 65/35', () => {
    const result = new PlanningExecutionStrategy().calculate({
      // Sub-group A: Sprint Planning Accuracy
      sprintCompletionRate: 100,
      scopeCreepRate: 0,
      storyPointSayDoRatio: 100,
      carryoverRate: 0,
      spilloverRatio: 0,
      midSprintAdditions: 0,
      consecutiveSpilloverCount: 0,
      carryoverAvgSprintsSurvived: 0,
      priorityChangeCount: 0,
      epicCompletionRatePercent: 100,
      // Sub-group B: Delivery Throughput & Focus
      throughputPerWeek: 15,
      bugVsFeatureRatio: 0.3,
    });
    expect(result.score).toBeCloseTo(100, 9);
    expect(result.level).toBe('HIGH');
    expect(result.weights.filter((w) => w.key.startsWith('planningAccuracy.'))).toHaveLength(10);
    expect(result.weights.filter((w) => w.key.startsWith('deliveryFocus.'))).toHaveLength(2);
  });

  it('scores a project at its worst across both sub-groups as 0', () => {
    const result = new PlanningExecutionStrategy().calculate({
      sprintCompletionRate: 0,
      scopeCreepRate: 40,
      storyPointSayDoRatio: 130, // outside the +-30 band around ideal 100
      carryoverRate: 40,
      spilloverRatio: 50,
      midSprintAdditions: 10,
      consecutiveSpilloverCount: 5,
      carryoverAvgSprintsSurvived: 5,
      priorityChangeCount: 10,
      epicCompletionRatePercent: 0,
      throughputPerWeek: 0,
      bugVsFeatureRatio: 0.6, // outside the +-0.3 band around ideal 0.3
    });
    expect(result.score).toBe(0);
    expect(result.level).toBe('LOW');
  });

  it('falls back to sub-group A alone, unhalved and unprefixed, when B has no data at all', () => {
    const result = new PlanningExecutionStrategy().calculate({ sprintCompletionRate: 100 });
    expect(result.score).toBe(100);
    expect(result.weights).toEqual([{ key: 'sprintCompletionRate', w: 1 }]);
  });

  it('falls back to sub-group B alone, unhalved and unprefixed, when A has no data at all', () => {
    const result = new PlanningExecutionStrategy().calculate({ throughputPerWeek: 15 });
    expect(result.score).toBe(100);
    expect(result.weights).toEqual([{ key: 'throughputPerWeek', w: 1 }]);
  });

  it('caps throughput at 100 once the weekly target is reached', () => {
    expect(new PlanningExecutionStrategy().calculate({ throughputPerWeek: 15 }).score).toBe(100);
    expect(new PlanningExecutionStrategy().calculate({ throughputPerWeek: 30 }).score).toBe(100);
  });

  it('bands bugVsFeatureRatio around its ideal instead of driving it to 0', () => {
    const atIdeal = new PlanningExecutionStrategy().calculate({ bugVsFeatureRatio: 0.3 });
    const halfwayOff = new PlanningExecutionStrategy().calculate({ bugVsFeatureRatio: 0.45 });
    expect(atIdeal.score).toBe(100);
    expect(halfwayOff.score).toBeCloseTo(50, 9);
  });

  it('returns a 0 score with no contributing weights when every signal is absent', () => {
    const result = new PlanningExecutionStrategy().calculate({});
    expect(result.score).toBe(0);
    expect(result.level).toBe('LOW');
    expect(result.weights).toEqual([]);
  });
});
