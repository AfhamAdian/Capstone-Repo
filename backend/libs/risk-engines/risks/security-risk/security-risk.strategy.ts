import { RiskResult, RiskType, SecurityRiskMetrics } from "../../types.js";
import { SecurityRiskRiskCalculator } from "./security-risk-risk-calculator.interface.js";

export class SecurityRiskStrategy implements SecurityRiskRiskCalculator {
  getType(): RiskType {
    return RiskType.SECURITY_RISK;
  }

  calculate(metrics: SecurityRiskMetrics): RiskResult {
    const openCriticalVulnerabilities = metrics.openCriticalVulnerabilities ?? 0;
    const openHighVulnerabilities = metrics.openHighVulnerabilities ?? 0;
    const dependencyUpdateLagDays = metrics.dependencyUpdateLagDays ?? 0;
    const prRevertRatePercent = metrics.prRevertRatePercent ?? 0;
    const incidentMttrHours = metrics.incidentMttrHours ?? 0;
    const longLivedUnmergedBranchesCount =
      metrics.longLivedUnmergedBranchesCount ?? 0;

    const criticalVulnScore = openCriticalVulnerabilities > 0 ? 0 : 100;
    const highVulnScore = Math.max(100 - openHighVulnerabilities * 5, 0);
    const dependencyLagScore = Math.max(100 - dependencyUpdateLagDays * 2, 0);
    const revertRateScore = Math.max(100 - prRevertRatePercent, 0);
    const incidentMttrScore = Math.max(100 - incidentMttrHours * 4, 0);
    const branchRiskScore = Math.max(100 - longLivedUnmergedBranchesCount * 4, 0);

    const metricScores: Record<string, number> = {
      criticalVulnScore,
      highVulnScore,
      revertRateScore,
      dependencyLagScore,
      incidentMttrScore,
      branchRiskScore,
    };

    const weights = [
      { key: "criticalVulnScore", w: 0.3 },
      { key: "highVulnScore", w: 0.15 },
      { key: "revertRateScore", w: 0.2 },
      { key: "dependencyLagScore", w: 0.15 },
      { key: "incidentMttrScore", w: 0.1 },
      { key: "branchRiskScore", w: 0.1 },
    ];

    let score = Math.min(
      weights.reduce((sum, item) => sum + (metricScores[item.key] ?? 0) * item.w, 0),
      100
    );

    if (openCriticalVulnerabilities > 0) {
      score = Math.min(score, 60);
    }

    return {
      type: RiskType.SECURITY_RISK,
      score,
      level: this.getLevel(score),
      weights,
    };
  }

  private getLevel(score: number): "LOW" | "MEDIUM" | "HIGH" {
    if (score >= 70) return "HIGH";
    if (score >= 40) return "MEDIUM";
    return "LOW";
  }
}
