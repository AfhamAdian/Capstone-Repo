import { PlanningExecutionMetrics, RiskResult, RiskType, RiskWeight } from "../../types.js";
import { PlanningExecutionRiskCalculator } from "./planning-execution-risk-calculator.interface.js";
import {
  bandedAround,
  clamp,
  higherIsBetterCapped,
  linearBetween,
  renormalizedWeightedScore,
  riskLevel,
  type WeightedSignal,
} from "../../scoring.js";

// Calibration placeholders - tune against real project data.
// See backend/libs/risk-engines/scoring-rules/07-planning-execution-score.md
const SCOPE_CREEP_RATE_GOOD_PERCENT = 0;
const SCOPE_CREEP_RATE_BAD_PERCENT = 40;
// storyPointSayDoRatio is a completed/committed percentage - 100 means committed == delivered.
const STORY_POINT_SAY_DO_IDEAL_PERCENT = 100;
const STORY_POINT_SAY_DO_TOLERANCE_PERCENT = 30;
const CARRYOVER_RATE_GOOD_PERCENT = 0;
const CARRYOVER_RATE_BAD_PERCENT = 40;
const SPILLOVER_RATIO_GOOD_PERCENT = 0;
const SPILLOVER_RATIO_BAD_PERCENT = 50;
const MID_SPRINT_ADDITIONS_GOOD = 0;
const MID_SPRINT_ADDITIONS_BAD = 10;
const CONSECUTIVE_SPILLOVER_GOOD = 0;
const CONSECUTIVE_SPILLOVER_BAD = 5;
const CARRYOVER_SPRINTS_SURVIVED_GOOD = 0;
const CARRYOVER_SPRINTS_SURVIVED_BAD = 5;
const PRIORITY_CHANGE_COUNT_GOOD = 0;
const PRIORITY_CHANGE_COUNT_BAD = 10;
const THROUGHPUT_PER_WEEK_TARGET = 15;
// Capacity-allocation measure, not a code-quality one - don't drive this toward 0 (some
// bug-fixing capacity is healthy). Banded around a defined target ratio instead.
const BUG_VS_FEATURE_RATIO_IDEAL = 0.3;
const BUG_VS_FEATURE_RATIO_TOLERANCE = 0.3;

export class PlanningExecutionStrategy implements PlanningExecutionRiskCalculator {
  getType(): RiskType {
    return RiskType.PLANNING_EXECUTION;
  }

  calculate(metrics: PlanningExecutionMetrics): RiskResult {
    const signalsA: WeightedSignal[] = [
      {
        key: "sprintCompletionRate",
        weight: 0.22,
        score:
          typeof metrics.sprintCompletionRate === "number" ? clamp(metrics.sprintCompletionRate) : null,
      },
      {
        key: "scopeCreepRate",
        weight: 0.16,
        score:
          typeof metrics.scopeCreepRate === "number"
            ? linearBetween(metrics.scopeCreepRate, SCOPE_CREEP_RATE_GOOD_PERCENT, SCOPE_CREEP_RATE_BAD_PERCENT)
            : null,
      },
      {
        key: "storyPointSayDoRatio",
        weight: 0.16,
        score:
          typeof metrics.storyPointSayDoRatio === "number"
            ? bandedAround(
                metrics.storyPointSayDoRatio,
                STORY_POINT_SAY_DO_IDEAL_PERCENT,
                STORY_POINT_SAY_DO_TOLERANCE_PERCENT,
              )
            : null,
      },
      {
        key: "carryoverRate",
        weight: 0.13,
        score:
          typeof metrics.carryoverRate === "number"
            ? linearBetween(metrics.carryoverRate, CARRYOVER_RATE_GOOD_PERCENT, CARRYOVER_RATE_BAD_PERCENT)
            : null,
      },
      {
        key: "spilloverRatio",
        weight: 0.11,
        score:
          typeof metrics.spilloverRatio === "number"
            ? linearBetween(metrics.spilloverRatio, SPILLOVER_RATIO_GOOD_PERCENT, SPILLOVER_RATIO_BAD_PERCENT)
            : null,
      },
      {
        key: "midSprintAdditions",
        weight: 0.07,
        score:
          typeof metrics.midSprintAdditions === "number"
            ? linearBetween(metrics.midSprintAdditions, MID_SPRINT_ADDITIONS_GOOD, MID_SPRINT_ADDITIONS_BAD)
            : null,
      },
      {
        key: "consecutiveSpilloverCount",
        weight: 0.06,
        score:
          typeof metrics.consecutiveSpilloverCount === "number"
            ? linearBetween(metrics.consecutiveSpilloverCount, CONSECUTIVE_SPILLOVER_GOOD, CONSECUTIVE_SPILLOVER_BAD)
            : null,
      },
      {
        key: "carryoverAvgSprintsSurvived",
        weight: 0.05,
        score:
          typeof metrics.carryoverAvgSprintsSurvived === "number"
            ? linearBetween(
                metrics.carryoverAvgSprintsSurvived,
                CARRYOVER_SPRINTS_SURVIVED_GOOD,
                CARRYOVER_SPRINTS_SURVIVED_BAD,
              )
            : null,
      },
      {
        key: "priorityChangeCount",
        weight: 0.03,
        score:
          typeof metrics.priorityChangeCount === "number"
            ? linearBetween(metrics.priorityChangeCount, PRIORITY_CHANGE_COUNT_GOOD, PRIORITY_CHANGE_COUNT_BAD)
            : null,
      },
      {
        key: "epicCompletionRate",
        weight: 0.01,
        score:
          typeof metrics.epicCompletionRatePercent === "number" ? clamp(metrics.epicCompletionRatePercent) : null,
      },
    ];

    const signalsB: WeightedSignal[] = [
      {
        key: "throughputPerWeek",
        weight: 0.65,
        score:
          typeof metrics.throughputPerWeek === "number"
            ? higherIsBetterCapped(metrics.throughputPerWeek, THROUGHPUT_PER_WEEK_TARGET)
            : null,
      },
      {
        key: "bugVsFeatureRatio",
        weight: 0.35,
        score:
          typeof metrics.bugVsFeatureRatio === "number"
            ? bandedAround(metrics.bugVsFeatureRatio, BUG_VS_FEATURE_RATIO_IDEAL, BUG_VS_FEATURE_RATIO_TOLERANCE)
            : null,
      },
    ];

    const resultA = renormalizedWeightedScore(signalsA);
    const resultB = renormalizedWeightedScore(signalsB);

    let score: number;
    let weights: RiskWeight[];

    if (resultA === null && resultB === null) {
      score = 0;
      weights = [];
    } else if (resultB === null) {
      score = resultA!.score;
      weights = resultA!.weights;
    } else if (resultA === null) {
      score = resultB!.score;
      weights = resultB!.weights;
    } else {
      score = clamp(resultA.score * 0.65 + resultB.score * 0.35);
      weights = [
        ...resultA.weights.map((w) => ({
          key: `planningAccuracy.${w.key}`,
          w: Math.round(w.w * 0.65 * 100) / 100,
        })),
        ...resultB.weights.map((w) => ({
          key: `deliveryFocus.${w.key}`,
          w: Math.round(w.w * 0.35 * 100) / 100,
        })),
      ];
    }

    return {
      type: RiskType.PLANNING_EXECUTION,
      score,
      level: riskLevel(score),
      weights,
    };
  }
}
