import { MaintainabilityMetrics, RiskResult, RiskType } from "../../types.js";
import { MaintainabilityRiskCalculator } from "./maintainability-risk-calculator.interface.js";
import {
  clamp,
  densityPerKloc,
  linearBetween,
  ratingToScore,
  renormalizedWeightedScore,
  riskLevel,
  type WeightedSignal,
} from "../../scoring.js";

// Calibration placeholders - tune against real project data.
// See backend/libs/risk-engines/scoring-rules/03-maintainability-score.md
const CODE_SMELLS_DENSITY_THRESHOLD_PER_KLOC = 20;
const HOTSPOT_FILES_DENSITY_THRESHOLD_PER_KLOC = 5;
const CODE_CHURN_DENSITY_THRESHOLD_PER_KLOC = 2;
// Per the doc, complexity is scored on the raw value, not size-normalized - these thresholds
// are therefore especially sensitive to project size and need real calibration.
const CYCLOMATIC_COMPLEXITY_GOOD = 100;
const CYCLOMATIC_COMPLEXITY_BAD = 5000;
const COGNITIVE_COMPLEXITY_GOOD = 50;
const COGNITIVE_COMPLEXITY_BAD = 3000;
const DUPLICATED_CODE_GOOD_PERCENT = 3;
const DUPLICATED_CODE_BAD_PERCENT = 30;
const NEW_DUPLICATED_LINES_GOOD_PERCENT = 3;
const NEW_DUPLICATED_LINES_BAD_PERCENT = 30;
const DEP_UPDATE_LAG_GOOD_DAYS = 7;
const DEP_UPDATE_LAG_BAD_DAYS = 90;
const NEW_DEBT_PENALTY_PER_MINUTE = 0.02;
const NEW_SMELLS_PENALTY_PER_SMELL = 1;
const MAX_PENALTY = 15;

export class MaintainabilityStrategy implements MaintainabilityRiskCalculator {
  getType(): RiskType {
    return RiskType.MAINTAINABILITY;
  }

  calculate(metrics: MaintainabilityMetrics): RiskResult {
    const codeSmellsDensity =
      metrics.codeSmells !== undefined && metrics.linesOfCode
        ? densityPerKloc(metrics.codeSmells, metrics.linesOfCode)
        : null;

    const hotspotFilesCount = metrics.hotspotFilesWorstOffenders?.reduce(
      (sum, file) => sum + file.hotspotCount,
      0,
    );
    const hotspotFilesDensity =
      hotspotFilesCount !== undefined && metrics.linesOfCode
        ? densityPerKloc(hotspotFilesCount, metrics.linesOfCode)
        : null;

    const codeChurnDensity =
      metrics.codeChurnHighFrequencyFilesCount !== undefined && metrics.linesOfCode
        ? densityPerKloc(metrics.codeChurnHighFrequencyFilesCount, metrics.linesOfCode)
        : null;

    const signals: WeightedSignal[] = [
      {
        key: "maintainabilityRating",
        weight: 0.3,
        score:
          typeof metrics.maintainabilityRating === "number"
            ? ratingToScore(metrics.maintainabilityRating)
            : null,
      },
      {
        key: "codeSmellsDensity",
        weight: 0.15,
        score:
          codeSmellsDensity !== null
            ? clamp(100 - (codeSmellsDensity / CODE_SMELLS_DENSITY_THRESHOLD_PER_KLOC) * 100)
            : null,
      },
      {
        key: "cyclomaticComplexity",
        weight: 0.1,
        score:
          typeof metrics.cyclomaticComplexity === "number"
            ? linearBetween(metrics.cyclomaticComplexity, CYCLOMATIC_COMPLEXITY_GOOD, CYCLOMATIC_COMPLEXITY_BAD)
            : null,
      },
      {
        key: "cognitiveComplexity",
        weight: 0.1,
        score:
          typeof metrics.cognitiveComplexity === "number"
            ? linearBetween(metrics.cognitiveComplexity, COGNITIVE_COMPLEXITY_GOOD, COGNITIVE_COMPLEXITY_BAD)
            : null,
      },
      {
        key: "duplicatedCode",
        weight: 0.1,
        score:
          typeof metrics.duplicatedLinesDensity === "number"
            ? linearBetween(metrics.duplicatedLinesDensity, DUPLICATED_CODE_GOOD_PERCENT, DUPLICATED_CODE_BAD_PERCENT)
            : null,
      },
      {
        key: "duplicatedLinesNewCode",
        weight: 0.05,
        score:
          typeof metrics.newDuplicatedLinesDensity === "number"
            ? linearBetween(
                metrics.newDuplicatedLinesDensity,
                NEW_DUPLICATED_LINES_GOOD_PERCENT,
                NEW_DUPLICATED_LINES_BAD_PERCENT,
              )
            : null,
      },
      {
        key: "codeChurnDensity",
        weight: 0.08,
        score:
          codeChurnDensity !== null
            ? clamp(100 - (codeChurnDensity / CODE_CHURN_DENSITY_THRESHOLD_PER_KLOC) * 100)
            : null,
      },
      {
        key: "hotspotFilesDensity",
        weight: 0.07,
        score:
          hotspotFilesDensity !== null
            ? clamp(100 - (hotspotFilesDensity / HOTSPOT_FILES_DENSITY_THRESHOLD_PER_KLOC) * 100)
            : null,
      },
      {
        key: "dependencyUpdateLag",
        weight: 0.05,
        score:
          typeof metrics.dependencyUpdateLagDays === "number"
            ? linearBetween(metrics.dependencyUpdateLagDays, DEP_UPDATE_LAG_GOOD_DAYS, DEP_UPDATE_LAG_BAD_DAYS)
            : null,
      },
    ];

    const result = renormalizedWeightedScore(signals);
    const baseScore = result?.score ?? 0;

    const newTechnicalDebt = metrics.newTechnicalDebt ?? 0;
    const newCodeSmells = metrics.newCodeSmells ?? 0;
    const penalty = Math.min(
      newTechnicalDebt * NEW_DEBT_PENALTY_PER_MINUTE + newCodeSmells * NEW_SMELLS_PENALTY_PER_SMELL,
      MAX_PENALTY,
    );
    const score = clamp(baseScore - penalty);

    return {
      type: RiskType.MAINTAINABILITY,
      score,
      level: riskLevel(score),
      weights: result?.weights ?? [],
    };
  }
}
