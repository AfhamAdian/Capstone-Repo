import { RiskCalculator } from "../risk-calculator.interface.js";
import { RiskResult, RiskType, TeamHealthMetrics } from "../types.js";

export class TeamHealthStrategy implements RiskCalculator<TeamHealthMetrics> {
  getType(): RiskType {
    return RiskType.TEAM_HEALTH;
  }

  calculate(metrics: TeamHealthMetrics): RiskResult {
    const busFactor = metrics.busFactor ?? 0;
    const codeOwnershipConcentrationPercent =
      metrics.codeOwnershipConcentrationPercent ?? 0;
    const reviewNetworkDensityPercent = metrics.reviewNetworkDensityPercent ?? 0;
    const activeContributionsPerWeek = metrics.activeContributionsPerWeek ?? 0;
    const blockedItemsCount = metrics.blockedItemsCount ?? 0;
    const blockedItemsAvgAgeDays = metrics.blockedItemsAvgAgeDays ?? 0;
    const overdueItemsCount = metrics.overdueItemsCount ?? 0;
    const hasBusFactorOneCriticalModule =
      metrics.hasBusFactorOneCriticalModule ?? false;

    const busFactorScore = Math.min((busFactor / 5) * 100, 100);
    const ownershipDistributionScore = Math.max(
      100 - codeOwnershipConcentrationPercent,
      0
    );
    const reviewNetworkScore = Math.min(reviewNetworkDensityPercent, 100);
    const contributionScore = Math.min((activeContributionsPerWeek / 20) * 100, 100);
    const blockedItemsScore = Math.max(
      100 - (blockedItemsCount * 2 + blockedItemsAvgAgeDays * 1.5),
      0
    );
    const overdueItemsScore = Math.max(100 - overdueItemsCount * 3, 0);

    const metricScores: Record<string, number> = {
      busFactorScore,
      ownershipDistributionScore,
      contributionScore,
      reviewNetworkScore,
      blockedItemsScore,
      overdueItemsScore,
    };

    const weights = [
      { key: "busFactorScore", w: 0.25 },
      { key: "ownershipDistributionScore", w: 0.2 },
      { key: "contributionScore", w: 0.2 },
      { key: "reviewNetworkScore", w: 0.15 },
      { key: "blockedItemsScore", w: 0.1 },
      { key: "overdueItemsScore", w: 0.1 },
    ];

    let score = Math.min(
      weights.reduce((sum, item) => sum + (metricScores[item.key] ?? 0) * item.w, 0),
      100
    );

    if (hasBusFactorOneCriticalModule) {
      score = Math.min(score, 20);
    }

    return {
      type: RiskType.TEAM_HEALTH,
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
