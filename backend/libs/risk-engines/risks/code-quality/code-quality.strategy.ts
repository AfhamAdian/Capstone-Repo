import { CodeQualityMetrics, RiskResult, RiskType } from "../../types.js";
import { CodeQualityRiskCalculator } from "./code-quality-risk-calculator.interface.js";

export class CodeQualityStrategy implements CodeQualityRiskCalculator {
  getType(): RiskType {
    return RiskType.CODE_QUALITY;
  }

  calculate(metrics: CodeQualityMetrics): RiskResult {
    const codeCoveragePercent = metrics.codeCoveragePercent ?? 0;
    const codeCoverageTrendDelta30d = metrics.codeCoverageTrendDelta30d ?? 0;
    const cyclomaticComplexityTrendDelta30d =
      metrics.cyclomaticComplexityTrendDelta30d ?? 0;
    const codeDuplicationPercent = metrics.codeDuplicationPercent ?? 0;
    const technicalDebtRatioPercent = metrics.technicalDebtRatioPercent ?? 0;
    const todoFixmeHackTrendDelta30d = metrics.todoFixmeHackTrendDelta30d ?? 0;
    const codeChurnRiskPercent = metrics.codeChurnRiskPercent ?? 0;

    const coverageTrendScore = Math.max(
      Math.min(100 + codeCoverageTrendDelta30d * 5, 100),
      0
    );
    const complexityTrendScore = Math.max(
      100 - Math.max(cyclomaticComplexityTrendDelta30d, 0) * 5,
      0
    );
    const duplicationScore = Math.max(100 - codeDuplicationPercent, 0);
    const technicalDebtScore = Math.max(100 - technicalDebtRatioPercent, 0);
    const todoTrendScore = Math.max(
      100 - Math.max(todoFixmeHackTrendDelta30d, 0) * 5,
      0
    );
    const churnScore = Math.max(100 - codeChurnRiskPercent, 0);

    const metricScores: Record<string, number> = {
      codeCoveragePercent,
      coverageTrendScore,
      complexityTrendScore,
      duplicationScore,
      technicalDebtScore,
      todoTrendScore,
      churnScore,
    };

    const weights = [
      { key: "codeCoveragePercent", w: 0.25 },
      { key: "coverageTrendScore", w: 0.1 },
      { key: "complexityTrendScore", w: 0.15 },
      { key: "duplicationScore", w: 0.15 },
      { key: "technicalDebtScore", w: 0.2 },
      { key: "todoTrendScore", w: 0.05 },
      { key: "churnScore", w: 0.1 },
    ];

    let score = Math.min(
      weights.reduce((sum, item) => sum + (metricScores[item.key] ?? 0) * item.w, 0),
      100
    );

    if (codeCoverageTrendDelta30d <= -10) {
      score = Math.min(score, 40);
    }

    return {
      type: RiskType.CODE_QUALITY,
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
