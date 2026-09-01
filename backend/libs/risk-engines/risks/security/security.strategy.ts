import { RiskResult, RiskType, SecurityMetrics } from "../../types.js";
import { SecurityRiskCalculator } from "./security-risk-calculator.interface.js";
import {
  clamp,
  densityPerKloc,
  linearBetween,
  ratingToScore,
  renormalizedWeightedScore,
  riskLevel,
  type WeightedSignal,
} from "../../scoring.js";

// Calibration placeholders - tune against real project data.
// See backend/libs/risk-engines/scoring-rules/01-security-score.md
const VULN_DENSITY_THRESHOLD_PER_KLOC = 5;
const HOTSPOT_DENSITY_THRESHOLD_PER_KLOC = 5;
const DEP_UPDATE_LAG_GOOD_DAYS = 7;
const DEP_UPDATE_LAG_BAD_DAYS = 90;
// Deviation from the doc's literal "per vuln" wording: SonarQube no longer
// returns a total vulnerability count (only newVulnerabilities), so there's
// no divisor left to normalize remediation effort per vulnerability. Scored
// as an absolute minutes value instead - see plan notes.
const REMEDIATION_EFFORT_GOOD_MINUTES = 60;
const REMEDIATION_EFFORT_BAD_MINUTES = 2400;
const PENALTY_PER_NEW_VULN = 2;
const MAX_PENALTY = 15;

export class SecurityStrategy implements SecurityRiskCalculator {
  getType(): RiskType {
    return RiskType.SECURITY;
  }

  calculate(metrics: SecurityMetrics): RiskResult {
    const vulnDensity =
      metrics.securityVulnerabilityCount !== undefined && metrics.linesOfCode
        ? densityPerKloc(metrics.securityVulnerabilityCount, metrics.linesOfCode)
        : null;

    const hotspotDensity =
      metrics.securityHotspots !== undefined && metrics.linesOfCode
        ? densityPerKloc(metrics.securityHotspots, metrics.linesOfCode)
        : null;

    const signals: WeightedSignal[] = [
      {
        key: "securityRating",
        weight: 0.25,
        score:
          typeof metrics.securityRating === "number" ? ratingToScore(metrics.securityRating) : null,
      },
      {
        key: "vulnCountDensity",
        weight: 0.2,
        score:
          vulnDensity !== null
            ? clamp(100 - (vulnDensity / VULN_DENSITY_THRESHOLD_PER_KLOC) * 100)
            : null,
      },
      {
        key: "securityReviewRating",
        weight: 0.15,
        score:
          typeof metrics.securityReviewRating === "number"
            ? ratingToScore(metrics.securityReviewRating)
            : null,
      },
      {
        key: "securityHotspotsDensity",
        weight: 0.15,
        score:
          hotspotDensity !== null
            ? clamp(100 - (hotspotDensity / HOTSPOT_DENSITY_THRESHOLD_PER_KLOC) * 100)
            : null,
      },
      {
        key: "dependencyUpdateLag",
        weight: 0.15,
        score:
          typeof metrics.dependencyUpdateLagDays === "number"
            ? linearBetween(metrics.dependencyUpdateLagDays, DEP_UPDATE_LAG_GOOD_DAYS, DEP_UPDATE_LAG_BAD_DAYS)
            : null,
      },
      {
        key: "securityRemediationEffort",
        weight: 0.1,
        score:
          typeof metrics.securityRemediationEffort === "number"
            ? linearBetween(
                metrics.securityRemediationEffort,
                REMEDIATION_EFFORT_GOOD_MINUTES,
                REMEDIATION_EFFORT_BAD_MINUTES,
              )
            : null,
      },
    ];

    const result = renormalizedWeightedScore(signals);
    const baseScore = result?.score ?? 0;

    const newVulnerabilities = metrics.newVulnerabilities ?? 0;
    const penalty = Math.min(newVulnerabilities * PENALTY_PER_NEW_VULN, MAX_PENALTY);
    const score = clamp(baseScore - penalty);

    return {
      type: RiskType.SECURITY,
      score,
      level: riskLevel(score),
      weights: result?.weights ?? [],
    };
  }
}
