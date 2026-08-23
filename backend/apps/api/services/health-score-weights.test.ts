import { describe, expect, it } from 'vitest';
import { blendCategory, blendOverall, describeBlend } from './health-score-weights.js';

describe('health-score-weights', () => {
  it('blends 60% metrics + 40% survey and rounds off float noise', () => {
    expect(blendCategory(12, 20)).toBe(15);
    expect(describeBlend(12, 20)).toBe('0.6 × 12 + 0.4 × 20 = 15');
  });

  it('falls back to a single side when the other is missing', () => {
    expect(describeBlend(22, null)).toBe('Metrics only: 22');
    expect(describeBlend(null, 40)).toBe('Survey only: 40');
  });

  it('weights categories into an overall score', () => {
    expect(
      blendOverall({
        delivery: 25,
        codeQuality: 20,
        cicd: 15,
        teamHealth: 28,
        blockers: 20,
      }),
    ).toBe(22);
  });
});
