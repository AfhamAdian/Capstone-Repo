import { EngineeringProcessMetrics, RiskResult, RiskType } from "../../types.js";
import { EngineeringProcessRiskCalculator } from "./engineering-process-risk-calculator.interface.js";

export class EngineeringProcessStrategy
  implements EngineeringProcessRiskCalculator
{
  getType(): RiskType {
    return RiskType.ENGINEERING_PROCESS;
  }

  calculate(metrics: EngineeringProcessMetrics): RiskResult {
    const prReviewCoveragePercent = metrics.prReviewCoveragePercent ?? 0;
    const selfMergedPrRatePercent = metrics.selfMergedPrRatePercent ?? 0;
    const timeToFirstReviewHours = metrics.timeToFirstReviewHours ?? 0;
    const unresolvedThreadsMergedCount =
      metrics.unresolvedThreadsMergedCount ?? 0;
    const commitMessageQualityPercent = metrics.commitMessageQualityPercent ?? 0;
    const longLivedBranchesCount = metrics.longLivedBranchesCount ?? 0;
    const stalePrCount = metrics.stalePrCount ?? 0;

    const selfMergeProcessScore = Math.max(100 - selfMergedPrRatePercent, 0);
    const firstReviewSpeedScore = Math.max(100 - timeToFirstReviewHours * 2, 0);
    const unresolvedThreadsScore = Math.max(
      100 - unresolvedThreadsMergedCount * 10,
      0
    );
    const branchHygieneScore = Math.max(
      100 - (longLivedBranchesCount * 4 + stalePrCount * 2),
      0
    );

    const metricScores: Record<string, number> = {
      prReviewCoveragePercent,
      selfMergeProcessScore,
      firstReviewSpeedScore,
      unresolvedThreadsScore,
      commitMessageQualityPercent,
      branchHygieneScore,
    };

    const weights = [
      { key: "prReviewCoveragePercent", w: 0.25 },
      { key: "selfMergeProcessScore", w: 0.2 },
      { key: "firstReviewSpeedScore", w: 0.15 },
      { key: "unresolvedThreadsScore", w: 0.15 },
      { key: "commitMessageQualityPercent", w: 0.15 },
      { key: "branchHygieneScore", w: 0.1 },
    ];

    let score = Math.min(
      weights.reduce((sum, item) => sum + (metricScores[item.key] ?? 0) * item.w, 0),
      100
    );

    if (selfMergedPrRatePercent > 20) {
      score = Math.min(score, 30);
    }

    const randomDecrement = Math.floor(Math.random() * 11) + 10;
    score = Math.max(score - randomDecrement, 0);

    return {
      type: RiskType.ENGINEERING_PROCESS,
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
