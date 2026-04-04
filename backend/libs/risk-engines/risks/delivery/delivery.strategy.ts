import { DeliveryMetrics, RiskResult, RiskType } from "../../types.js";
import { DeliveryRiskCalculator } from "./delivery-risk-calculator.interface.js";

export class DeliveryStrategy implements DeliveryRiskCalculator {
  getType(): RiskType {
    return RiskType.DELIVERY;
  }

  calculate(metrics: DeliveryMetrics): RiskResult {
    const sprintCompletionRate = metrics.sprintCompletionRate ?? 0;
    const issueCycleTimeDays = metrics.issueCycleTimeDays ?? 0;
    const throughputPerWeek = metrics.throughputPerWeek ?? 0;
    const carryoverRate = metrics.carryoverRate ?? 0;
    const scopeCreepRate = metrics.scopeCreepRate ?? 0;
    const estimationAccuracy = metrics.estimationAccuracy ?? 0;
    const consecutiveLowSprintCompletionCount =
      metrics.consecutiveLowSprintCompletionCount ?? 0;

    const issueCycleTimeScore = Math.max(100 - issueCycleTimeDays * 2, 0);
    const throughputScore = Math.min((throughputPerWeek / 20) * 100, 100);
    const carryoverScore = Math.max(100 - carryoverRate, 0);
    const scopeCreepScore = Math.max(100 - scopeCreepRate, 0);

    const metricScores: Record<string, number> = {
      sprintCompletionRate,
      issueCycleTimeScore,
      throughputScore,
      carryoverScore,
      scopeCreepScore,
      estimationAccuracy,
    };

    const weights = [
      { key: "sprintCompletionRate", w: 0.25 },
      { key: "issueCycleTimeScore", w: 0.2 },
      { key: "throughputScore", w: 0.2 },
      { key: "carryoverScore", w: 0.15 },
      { key: "scopeCreepScore", w: 0.1 },
      { key: "estimationAccuracy", w: 0.1 },
    ];

    let score = Math.min(
      weights.reduce((sum, item) => sum + (metricScores[item.key] ?? 0) * item.w, 0),
      100
    );

    if (
      sprintCompletionRate < 50 &&
      consecutiveLowSprintCompletionCount >= 2
    ) {
      score = Math.min(score, 40);
    }

    return {
      type: RiskType.DELIVERY,
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
