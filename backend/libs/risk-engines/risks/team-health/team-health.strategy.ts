import { RiskResult, RiskType, TeamHealthMetrics } from "../../types.js";
import { TeamHealthRiskCalculator } from "./team-health-risk-calculator.interface.js";
import {
  clamp,
  higherIsBetterCapped,
  linearBetween,
  renormalizedWeightedScore,
  riskLevel,
  type WeightedSignal,
} from "../../scoring.js";

// Calibration placeholders - tune against real team-size data.
// See backend/libs/risk-engines/scoring-rules/05-team-health-score.md
const BUS_FACTOR_TARGET = 5;
const OWNERSHIP_CONCENTRATION_GOOD_PERCENT = 20;
const OWNERSHIP_CONCENTRATION_BAD_PERCENT = 80;
const ACTIVE_CONTRIBUTORS_TARGET = 5; // expected team size

export class TeamHealthStrategy implements TeamHealthRiskCalculator {
  getType(): RiskType {
    return RiskType.TEAM_HEALTH;
  }

  calculate(metrics: TeamHealthMetrics): RiskResult {
    const signals: WeightedSignal[] = [
      {
        key: "busFactor",
        weight: 0.35,
        score:
          typeof metrics.busFactor === "number"
            ? higherIsBetterCapped(metrics.busFactor, BUS_FACTOR_TARGET)
            : null,
      },
      {
        key: "ownershipConcentration",
        weight: 0.3,
        score:
          typeof metrics.codeOwnershipConcentrationPercent === "number"
            ? linearBetween(
                metrics.codeOwnershipConcentrationPercent,
                OWNERSHIP_CONCENTRATION_GOOD_PERCENT,
                OWNERSHIP_CONCENTRATION_BAD_PERCENT,
              )
            : null,
      },
      {
        key: "reviewNetworkDensity",
        weight: 0.25,
        score:
          typeof metrics.reviewNetworkDensityPercent === "number"
            ? clamp(metrics.reviewNetworkDensityPercent)
            : null,
      },
      {
        key: "activeContributors",
        weight: 0.1,
        score:
          typeof metrics.activeContributionsPerWeek === "number"
            ? higherIsBetterCapped(metrics.activeContributionsPerWeek, ACTIVE_CONTRIBUTORS_TARGET)
            : null,
      },
    ];

    const result = renormalizedWeightedScore(signals);
    const score = result?.score ?? 0;

    return {
      type: RiskType.TEAM_HEALTH,
      score,
      level: riskLevel(score),
      weights: result?.weights ?? [],
    };
  }
}
