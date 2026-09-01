import { describe, it, expect } from 'vitest';
import {
  bandedAround,
  clamp,
  densityPerKloc,
  higherIsBetterCapped,
  linearBetween,
  ratingToScore,
  renormalizedWeightedScore,
  riskLevel,
  toScore,
} from './scoring.js';

describe('clamp', () => {
  it('passes values already inside the range through unchanged', () => {
    expect(clamp(50)).toBe(50);
  });

  it('floors values below the minimum', () => {
    expect(clamp(-10)).toBe(0);
  });

  it('ceilings values above the maximum', () => {
    expect(clamp(150)).toBe(100);
  });

  it('respects a custom range', () => {
    expect(clamp(5, 10, 20)).toBe(10);
    expect(clamp(25, 10, 20)).toBe(20);
    expect(clamp(15, 10, 20)).toBe(15);
  });
});

describe('toScore', () => {
  it('applies the scoring function when the value is a finite number', () => {
    expect(toScore(4, (v) => v * 10)).toBe(40);
  });

  it('returns null for undefined, null, and non-finite input', () => {
    expect(toScore(undefined, (v) => v)).toBeNull();
    expect(toScore(null, (v) => v)).toBeNull();
    expect(toScore(NaN, (v) => v)).toBeNull();
    expect(toScore(Infinity, (v) => v)).toBeNull();
  });
});

describe('renormalizedWeightedScore', () => {
  it('returns null when no signal is present', () => {
    const result = renormalizedWeightedScore([
      { key: 'a', score: null, weight: 0.5 },
      { key: 'b', score: undefined, weight: 0.5 },
    ]);
    expect(result).toBeNull();
  });

  it('computes a plain weighted average when every signal is present', () => {
    const result = renormalizedWeightedScore([
      { key: 'a', score: 100, weight: 0.5 },
      { key: 'b', score: 0, weight: 0.5 },
    ]);
    expect(result?.score).toBe(50);
    expect(result?.weights).toEqual([
      { key: 'a', w: 0.5 },
      { key: 'b', w: 0.5 },
    ]);
  });

  it('excludes missing signals and renormalizes the remaining weights to sum to 1', () => {
    // Only 'a' (weight 0.25) is present; it should end up carrying the full score,
    // not be dragged down as if the missing signals scored 0.
    const result = renormalizedWeightedScore([
      { key: 'a', score: 80, weight: 0.25 },
      { key: 'b', score: null, weight: 0.5 },
      { key: 'c', score: undefined, weight: 0.25 },
    ]);
    expect(result?.score).toBe(80);
    expect(result?.weights).toEqual([{ key: 'a', w: 1 }]);
  });

  it('excludes a present signal whose weight is 0', () => {
    const result = renormalizedWeightedScore([
      { key: 'a', score: 100, weight: 0 },
      { key: 'b', score: 40, weight: 1 },
    ]);
    expect(result?.score).toBe(40);
    expect(result?.weights).toEqual([{ key: 'b', w: 1 }]);
  });

  it('clamps the result even if an individual signal score is out of 0..100', () => {
    const result = renormalizedWeightedScore([{ key: 'a', score: 250, weight: 1 }]);
    expect(result?.score).toBe(100);
  });
});

describe('riskLevel', () => {
  it('buckets below 40 as LOW', () => {
    expect(riskLevel(0)).toBe('LOW');
    expect(riskLevel(39)).toBe('LOW');
  });

  it('buckets 40..69 as MEDIUM', () => {
    expect(riskLevel(40)).toBe('MEDIUM');
    expect(riskLevel(69)).toBe('MEDIUM');
  });

  it('buckets 70 and above as HIGH', () => {
    expect(riskLevel(70)).toBe('HIGH');
    expect(riskLevel(100)).toBe('HIGH');
  });
});

describe('ratingToScore', () => {
  it('maps SonarQube A..E ratings (1..5) onto 100..0', () => {
    expect(ratingToScore(1)).toBe(100);
    expect(ratingToScore(2)).toBe(75);
    expect(ratingToScore(3)).toBe(50);
    expect(ratingToScore(4)).toBe(25);
    expect(ratingToScore(5)).toBe(0);
  });

  it('clamps out-of-range ratings', () => {
    expect(ratingToScore(0)).toBe(100);
    expect(ratingToScore(6)).toBe(0);
  });
});

describe('densityPerKloc', () => {
  it('normalizes a count per 1000 lines of code', () => {
    expect(densityPerKloc(10, 10000)).toBe(1);
    expect(densityPerKloc(5, 1000)).toBe(5);
  });

  it('returns null when linesOfCode is zero or negative', () => {
    expect(densityPerKloc(10, 0)).toBeNull();
    expect(densityPerKloc(10, -100)).toBeNull();
  });
});

describe('linearBetween', () => {
  it('maps the good value to 100 and the bad value to 0', () => {
    expect(linearBetween(7, 7, 90)).toBe(100);
    expect(linearBetween(90, 7, 90)).toBe(0);
  });

  it('interpolates linearly at the midpoint', () => {
    expect(linearBetween(48.5, 7, 90)).toBeCloseTo(50, 5);
  });

  it('clamps beyond both ends', () => {
    expect(linearBetween(0, 7, 90)).toBe(100);
    expect(linearBetween(200, 7, 90)).toBe(0);
  });
});

describe('higherIsBetterCapped', () => {
  it('scales linearly up to the target', () => {
    expect(higherIsBetterCapped(0, 10)).toBe(0);
    expect(higherIsBetterCapped(5, 10)).toBe(50);
    expect(higherIsBetterCapped(10, 10)).toBe(100);
  });

  it('caps at 100 once the value exceeds the target', () => {
    expect(higherIsBetterCapped(20, 10)).toBe(100);
  });
});

describe('bandedAround', () => {
  it('scores the ideal value as 100', () => {
    expect(bandedAround(100, 100, 20)).toBe(100);
  });

  it('penalizes both overshoot and undershoot symmetrically', () => {
    expect(bandedAround(120, 100, 20)).toBe(0);
    expect(bandedAround(80, 100, 20)).toBe(0);
  });

  it('scores halfway to the tolerance edge as 50', () => {
    expect(bandedAround(110, 100, 20)).toBe(50);
    expect(bandedAround(90, 100, 20)).toBe(50);
  });
});
