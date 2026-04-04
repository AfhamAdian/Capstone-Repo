import { CicdReliabilityMetrics, RiskResult, RiskType } from "../../types.js";
import { CicdReliabilityRiskCalculator } from "./cicd-reliability-risk-calculator.interface.js";

export class CicdReliabilityStrategy
  implements CicdReliabilityRiskCalculator
{
  getType(): RiskType {
    return RiskType.CICD_RELIABILITY;
  }

  calculate(metrics: CicdReliabilityMetrics): RiskResult {
    const pipelineSuccessRatePercent = metrics.pipelineSuccessRatePercent ?? 0;
    const pipelineDurationTrendDelta30d = metrics.pipelineDurationTrendDelta30d ?? 0;
    const deploymentFrequencyPerWeek = metrics.deploymentFrequencyPerWeek ?? 0;
    const deploymentFailureRatePercent = metrics.deploymentFailureRatePercent ?? 0;
    const mttrHours = metrics.mttrHours ?? 0;
    const flakyTestCount = metrics.flakyTestCount ?? 0;

    const pipelineDurationScore = Math.max(
      100 - Math.max(pipelineDurationTrendDelta30d, 0) * 4,
      0
    );
    const deploymentFrequencyScore = Math.min(
      (deploymentFrequencyPerWeek / 14) * 100,
      100
    );
    const deploymentFailureScore = Math.max(100 - deploymentFailureRatePercent, 0);
    const mttrScore = Math.max(100 - mttrHours * 4, 0);
    const flakyTestScore = Math.max(100 - flakyTestCount * 5, 0);

    const metricScores: Record<string, number> = {
      pipelineSuccessRatePercent,
      pipelineDurationScore,
      deploymentFrequencyScore,
      deploymentFailureScore,
      mttrScore,
      flakyTestScore,
    };

    const weights = [
      { key: "pipelineSuccessRatePercent", w: 0.3 },
      { key: "pipelineDurationScore", w: 0.15 },
      { key: "deploymentFrequencyScore", w: 0.2 },
      { key: "deploymentFailureScore", w: 0.2 },
      { key: "mttrScore", w: 0.1 },
      { key: "flakyTestScore", w: 0.05 },
    ];

    const score = Math.min(
      weights.reduce((sum, item) => sum + (metricScores[item.key] ?? 0) * item.w, 0),
      100
    );

    return {
      type: RiskType.CICD_RELIABILITY,
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
