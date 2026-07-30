import { CicdReliabilityMetrics, RiskResult, RiskType } from "../../types.js";
import { CicdReliabilityRiskCalculator } from "./cicd-reliability-risk-calculator.interface.js";

export class CicdReliabilityStrategy
  implements CicdReliabilityRiskCalculator
{
  getType(): RiskType {
    return RiskType.CICD_RELIABILITY;
  }

  calculate(metrics: CicdReliabilityMetrics): RiskResult {
    const pipelineSuccessRatePercent = metrics.pipelineSuccessRatePercent ?? 100;
    const avgPipelineDurationMinutes = metrics.avgPipelineDurationMinutes ?? 0;
    const flakyTestCount = metrics.flakyTestCount ?? 0;
    const testCoveragePercent = metrics.testCoveragePercent ?? 100;
    const testFailureRatePercent = metrics.testFailureRatePercent ?? 0;
    const avgPipelineRunsPerPr = metrics.avgPipelineRunsPerPr ?? 0;
    const deploymentsPerWeek = metrics.deploymentsPerWeek ?? 10;
    const deploymentFailureRatePercent = metrics.deploymentFailureRatePercent ?? 0;
    const mttrHours = metrics.mttrHours ?? 0;
    const timeToProdHours = metrics.timeToProdHours ?? 0;

    // Higher score = More Risk
    const pipelineSuccessScore = Math.max(100 - pipelineSuccessRatePercent, 0);
    const pipelineDurationScore = Math.min((avgPipelineDurationMinutes / 30) * 100, 100);
    const flakyTestScore = Math.min(flakyTestCount * 10, 100);
    const testCoverageScore = Math.max(100 - testCoveragePercent, 0);
    const testFailureScore = Math.min(testFailureRatePercent * 10, 100);
    const pipelineRunsPerPrScore = Math.min(avgPipelineRunsPerPr * 10, 100);
    const deploymentFrequencyScore = Math.max(100 - (deploymentsPerWeek * 10), 0);
    const deploymentFailureScore = Math.min(deploymentFailureRatePercent, 100);
    const mttrScore = Math.min(mttrHours * 5, 100);
    const timeToProdScore = Math.min((timeToProdHours / 24) * 100, 100);

    const metricScores: Record<string, number> = {
      pipelineSuccessScore,
      deploymentFailureScore,
      deploymentFrequencyScore,
      flakyTestScore,
      testCoverageScore,
      testFailureScore,
      mttrScore,
      pipelineDurationScore,
      pipelineRunsPerPrScore,
      timeToProdScore,
    };

    const weights = [
      { key: "pipelineSuccessScore", w: 0.15 },
      { key: "deploymentFailureScore", w: 0.15 },
      { key: "deploymentFrequencyScore", w: 0.15 },
      { key: "flakyTestScore", w: 0.10 },
      { key: "testCoverageScore", w: 0.10 },
      { key: "testFailureScore", w: 0.10 },
      { key: "mttrScore", w: 0.10 },
      { key: "pipelineDurationScore", w: 0.05 },
      { key: "pipelineRunsPerPrScore", w: 0.05 },
      { key: "timeToProdScore", w: 0.05 },
    ];

    const score = Math.round(Math.min(
      weights.reduce((sum, item) => sum + (metricScores[item.key] ?? 0) * item.w, 0),
      100
    ));

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
