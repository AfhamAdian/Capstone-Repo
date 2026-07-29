import { RiskResult, RiskType, BlockersMetrics } from "../../types.js";
import { BlockersRiskCalculator } from "./blockers-risk-calculator.interface.js";

/**
 * Reuses the same blocked/overdue item scoring formula already used inside
 * TeamHealthStrategy (where they're each weighted 10%), promoted to its own
 * risk type so the survey feature's rubric can blend a "blockers" category
 * without needing to touch/reweight TeamHealthStrategy itself.
 */
export class BlockersStrategy implements BlockersRiskCalculator {
  getType(): RiskType {
    return RiskType.BLOCKERS;
  }

  calculate(metrics: BlockersMetrics): RiskResult {
    const blockedItemsCount = metrics.blockedItemsCount ?? 0;
    const blockedItemsAvgAgeDays = metrics.blockedItemsAvgAgeDays ?? 0;
    const overdueItemsCount = metrics.overdueItemsCount ?? 0;

    const blockedItemsScore = Math.max(
      100 - (blockedItemsCount * 2 + blockedItemsAvgAgeDays * 1.5),
      0
    );
    const overdueItemsScore = Math.max(100 - overdueItemsCount * 3, 0);

    const weights = [
      { key: "blockedItemsScore", w: 0.5 },
      { key: "overdueItemsScore", w: 0.5 },
    ];

    const score = Math.min(blockedItemsScore * 0.5 + overdueItemsScore * 0.5, 100);

    return {
      type: RiskType.BLOCKERS,
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
