import { CodeQualityMetrics, RiskResult, RiskType } from "../../types.js";
import { CodeQualityRiskCalculator } from "./code-quality-risk-calculator.interface.js";
import {
  clamp,
  renormalizedWeightedScore,
  riskLevel,
  toScore,
  type WeightedSignal,
} from "../../scoring.js";

export class CodeQualityStrategy implements CodeQualityRiskCalculator {
  getType(): RiskType {
    return RiskType.CODE_QUALITY;
  }

  calculate(metrics: CodeQualityMetrics): RiskResult {
    // Each signal is null when its input is absent; absent signals are dropped
    // and the remaining weights renormalized (see scoring.ts). SonarQube fills
    // coverage, duplication and technical debt; trend/churn inputs stay absent
    // until a data source exists for them.
    const signals: WeightedSignal[] = [
      {
        key: "codeCoverage",
        weight: 0.25,
        score: toScore(metrics.codeCoveragePercent, (value) => clamp(value)),
      },
      {
        key: "coverageTrend",
        weight: 0.1,
        score: toScore(metrics.codeCoverageTrendDelta30d, (value) => clamp(100 + value * 5)),
      },
      {
        key: "complexityTrend",
        weight: 0.15,
        score: toScore(metrics.cyclomaticComplexityTrendDelta30d, (value) =>
          clamp(100 - Math.max(value, 0) * 5),
        ),
      },
      {
        key: "duplication",
        weight: 0.15,
        score: toScore(metrics.codeDuplicationPercent, (value) => clamp(100 - value)),
      },
      {
        key: "technicalDebt",
        weight: 0.2,
        score: toScore(metrics.technicalDebtRatioPercent, (value) => clamp(100 - value)),
      },
      {
        key: "todoTrend",
        weight: 0.05,
        score: toScore(metrics.todoFixmeHackTrendDelta30d, (value) =>
          clamp(100 - Math.max(value, 0) * 5),
        ),
      },
      {
        key: "churn",
        weight: 0.1,
        score: toScore(metrics.codeChurnRiskPercent, (value) => clamp(100 - value)),
      },
    ];

    const result = renormalizedWeightedScore(signals);
    let score = result?.score ?? 0;

    // Sharp coverage drop caps the score, but only when the trend is known.
    if (
      typeof metrics.codeCoverageTrendDelta30d === "number" &&
      metrics.codeCoverageTrendDelta30d <= -10
    ) {
      score = Math.min(score, 40);
    }

    return {
      type: RiskType.CODE_QUALITY,
      score,
      level: riskLevel(score),
      weights: result?.weights ?? [],
    };
  }
}
