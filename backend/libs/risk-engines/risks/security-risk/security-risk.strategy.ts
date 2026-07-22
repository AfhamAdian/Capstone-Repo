import { RiskResult, RiskType, SecurityRiskMetrics } from "../../types.js";
import { SecurityRiskRiskCalculator } from "./security-risk-risk-calculator.interface.js";
import {
  clamp,
  renormalizedWeightedScore,
  riskLevel,
  toScore,
  type WeightedSignal,
} from "../../scoring.js";

export class SecurityRiskStrategy implements SecurityRiskRiskCalculator {
  getType(): RiskType {
    return RiskType.SECURITY_RISK;
  }

  calculate(metrics: SecurityRiskMetrics): RiskResult {
    // Vulnerability severity counts come from SonarQube; dependency lag and PR
    // revert rate come from the VCS connector. Absent signals are dropped and
    // the remaining weights renormalized (see scoring.ts).
    const signals: WeightedSignal[] = [
      {
        key: "criticalVulnerabilities",
        weight: 0.3,
        score: toScore(metrics.openCriticalVulnerabilities, (value) => (value > 0 ? 0 : 100)),
      },
      {
        key: "highVulnerabilities",
        weight: 0.15,
        score: toScore(metrics.openHighVulnerabilities, (value) => clamp(100 - value * 5)),
      },
      {
        key: "revertRate",
        weight: 0.2,
        score: toScore(metrics.prRevertRatePercent, (value) => clamp(100 - value)),
      },
      {
        key: "dependencyLag",
        weight: 0.15,
        score: toScore(metrics.dependencyUpdateLagDays, (value) => clamp(100 - value * 2)),
      },
      {
        key: "incidentMttr",
        weight: 0.1,
        score: toScore(metrics.incidentMttrHours, (value) => clamp(100 - value * 4)),
      },
      {
        key: "branchRisk",
        weight: 0.1,
        score: toScore(metrics.longLivedUnmergedBranchesCount, (value) => clamp(100 - value * 4)),
      },
    ];

    const result = renormalizedWeightedScore(signals);
    let score = result?.score ?? 0;

    // Any open critical vulnerability caps the score, when that count is known.
    if (
      typeof metrics.openCriticalVulnerabilities === "number" &&
      metrics.openCriticalVulnerabilities > 0
    ) {
      score = Math.min(score, 60);
    }

    return {
      type: RiskType.SECURITY_RISK,
      score,
      level: riskLevel(score),
      weights: result?.weights ?? [],
    };
  }
}
