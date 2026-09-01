import { describe, it, expect } from 'vitest';
import { RiskType } from '../../types.js';
import { SecurityStrategy } from './security.strategy.js';

describe('SecurityStrategy', () => {
  it('reports its risk type', () => {
    expect(new SecurityStrategy().getType()).toBe(RiskType.SECURITY);
  });

  it('scores a project with every signal clean as a perfect 100', () => {
    const result = new SecurityStrategy().calculate({
      securityRating: 1, // 'A' -> 100
      securityVulnerabilityCount: 0,
      linesOfCode: 10000,
      securityReviewRating: 1, // 'A' -> 100
      securityHotspots: 0,
      dependencyUpdateLagDays: 3, // under the 7-day "good" threshold -> clamped to 100
      newVulnerabilities: 0,
      // securityRemediationEffort intentionally omitted - should be dropped, not scored 0
    });

    expect(result.type).toBe(RiskType.SECURITY);
    expect(result.score).toBe(100);
    expect(result.level).toBe('HIGH');
  });

  it('scores a project with every signal at its worst as 0, then the new-vuln penalty floors at 0', () => {
    const result = new SecurityStrategy().calculate({
      securityRating: 5, // 'E' -> 0
      securityVulnerabilityCount: 100,
      linesOfCode: 1000, // density 100/kloc, far past the 5/kloc threshold -> 0
      securityReviewRating: 5, // 'E' -> 0
      securityHotspots: 100, // same density story -> 0
      dependencyUpdateLagDays: 200, // past the 90-day "bad" threshold -> 0
      securityRemediationEffort: 5000, // past the 2400-minute "bad" threshold -> 0
      newVulnerabilities: 50, // penalty capped, but base is already 0
    });

    expect(result.score).toBe(0);
    expect(result.level).toBe('LOW');
    // All six signals were present, so weights come back exactly as declared (no renormalization).
    expect(result.weights).toEqual([
      { key: 'securityRating', w: 0.25 },
      { key: 'vulnCountDensity', w: 0.2 },
      { key: 'securityReviewRating', w: 0.15 },
      { key: 'securityHotspotsDensity', w: 0.15 },
      { key: 'dependencyUpdateLag', w: 0.15 },
      { key: 'securityRemediationEffort', w: 0.1 },
    ]);
  });

  it('renormalizes weights around whatever signals are actually present', () => {
    // Only securityRating is supplied - it should carry the full score at full weight,
    // not be diluted as if the other five signals were failing.
    const result = new SecurityStrategy().calculate({ securityRating: 1 });

    expect(result.score).toBe(100);
    expect(result.weights).toEqual([{ key: 'securityRating', w: 1 }]);
  });

  it('does not compute a vulnerability/hotspot density without linesOfCode', () => {
    // securityVulnerabilityCount and securityHotspots are present but linesOfCode is not,
    // so those two density signals must be dropped rather than treated as 0 vulns/kloc.
    const withCount = new SecurityStrategy().calculate({
      securityRating: 1,
      securityVulnerabilityCount: 999,
      securityHotspots: 999,
    });
    const withoutCount = new SecurityStrategy().calculate({ securityRating: 1 });

    expect(withCount.score).toBe(withoutCount.score);
    expect(withCount.weights).toEqual([{ key: 'securityRating', w: 1 }]);
  });

  it('subtracts 2 points per new vulnerability from the base score', () => {
    const clean = new SecurityStrategy().calculate({ securityRating: 1, newVulnerabilities: 0 });
    const withThree = new SecurityStrategy().calculate({ securityRating: 1, newVulnerabilities: 3 });

    expect(clean.score - withThree.score).toBe(6);
  });

  it('caps the new-vulnerability penalty at 15 points', () => {
    // 10 new vulns * 2 points would be a 20-point penalty; it must cap at 15.
    const result = new SecurityStrategy().calculate({ securityRating: 1, newVulnerabilities: 10 });
    expect(result.score).toBe(85);
  });

  it('returns a 0 score with no contributing weights when every signal is absent', () => {
    const result = new SecurityStrategy().calculate({});

    expect(result.score).toBe(0);
    expect(result.level).toBe('LOW');
    expect(result.weights).toEqual([]);
  });
});
