import { ReliabilityMetrics, RiskResult, RiskType } from "../../types.js";
import { ReliabilityRiskCalculator } from "./reliability-risk-calculator.interface.js";
import {
  clamp,
  linearBetween,
  ratingToScore,
  renormalizedWeightedScore,
  riskLevel,
  type WeightedSignal,
} from "../../scoring.js";

// Calibration placeholders - tune against real project data.
// See backend/libs/risk-engines/scoring-rules/02-reliability-score.md
const TEST_FAILURE_RATE_GOOD_PERCENT = 0;
const TEST_FAILURE_RATE_BAD_PERCENT = 20;
const FLAKY_TEST_COUNT_GOOD = 0;
const FLAKY_TEST_COUNT_BAD = 20;
const ISSUE_REOPEN_RATE_GOOD_PERCENT = 0;
const ISSUE_REOPEN_RATE_BAD_PERCENT = 30;
const MR_REVERT_RATE_GOOD_PERCENT = 0;
const MR_REVERT_RATE_BAD_PERCENT = 20;
// Same deviation as Security's remediation effort: SonarQube no longer returns a total
// bug count (only newBugs), so there's no divisor left to normalize "per bug". Scored as
// an absolute minutes value instead.
const REMEDIATION_EFFORT_GOOD_MINUTES = 60;
const REMEDIATION_EFFORT_BAD_MINUTES = 2400;
const PENALTY_PER_NEW_BUG = 2;
const MAX_PENALTY = 15;

export class ReliabilityStrategy implements ReliabilityRiskCalculator {
  getType(): RiskType {
    return RiskType.RELIABILITY;
  }

  calculate(metrics: ReliabilityMetrics): RiskResult {
    const signals: WeightedSignal[] = [
      {
        key: "reliabilityRating",
        weight: 0.3,
        score:
          typeof metrics.reliabilityRating === "number"
            ? ratingToScore(metrics.reliabilityRating)
            : null,
      },
      {
        key: "testFailureRate",
        weight: 0.15,
        score:
          typeof metrics.testFailureRatePercent === "number"
            ? linearBetween(
                metrics.testFailureRatePercent,
                TEST_FAILURE_RATE_GOOD_PERCENT,
                TEST_FAILURE_RATE_BAD_PERCENT,
              )
            : null,
      },
      {
        key: "coverageOverall",
        weight: 0.14,
        score: typeof metrics.coverage === "number" ? clamp(metrics.coverage) : null,
      },
      {
        key: "flakyTestCount",
        weight: 0.1,
        score:
          typeof metrics.flakyTestCount === "number"
            ? linearBetween(metrics.flakyTestCount, FLAKY_TEST_COUNT_GOOD, FLAKY_TEST_COUNT_BAD)
            : null,
      },
      {
        key: "coverageNewCode",
        weight: 0.09,
        score: typeof metrics.newCoverage === "number" ? clamp(metrics.newCoverage) : null,
      },
      {
        key: "issueReopenRate",
        weight: 0.08,
        score:
          typeof metrics.issueReopenRatePercent === "number"
            ? linearBetween(
                metrics.issueReopenRatePercent,
                ISSUE_REOPEN_RATE_GOOD_PERCENT,
                ISSUE_REOPEN_RATE_BAD_PERCENT,
              )
            : null,
      },
      {
        key: "mrRevertRate",
        weight: 0.08,
        score:
          typeof metrics.mrRevertRatePercent === "number"
            ? linearBetween(
                metrics.mrRevertRatePercent,
                MR_REVERT_RATE_GOOD_PERCENT,
                MR_REVERT_RATE_BAD_PERCENT,
              )
            : null,
      },
      {
        key: "qualityGatePassRate",
        weight: 0.04,
        score:
          typeof metrics.qualityGatePassRatePercent === "number"
            ? clamp(metrics.qualityGatePassRatePercent)
            : null,
      },
      {
        key: "reliabilityRemediationEffort",
        weight: 0.02,
        score:
          typeof metrics.reliabilityRemediationEffort === "number"
            ? linearBetween(
                metrics.reliabilityRemediationEffort,
                REMEDIATION_EFFORT_GOOD_MINUTES,
                REMEDIATION_EFFORT_BAD_MINUTES,
              )
            : null,
      },
    ];

    const result = renormalizedWeightedScore(signals);
    const baseScore = result?.score ?? 0;

    const newBugs = metrics.newBugs ?? 0;
    const penalty = Math.min(newBugs * PENALTY_PER_NEW_BUG, MAX_PENALTY);
    const score = clamp(baseScore - penalty);

    return {
      type: RiskType.RELIABILITY,
      score,
      level: riskLevel(score),
      weights: result?.weights ?? [],
    };
  }
}
