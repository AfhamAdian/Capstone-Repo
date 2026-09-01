import { EngineeringProcessMetrics, RiskResult, RiskType, RiskWeight } from "../../types.js";
import { EngineeringProcessRiskCalculator } from "./engineering-process-risk-calculator.interface.js";
import {
  bandedAround,
  clamp,
  linearBetween,
  renormalizedWeightedScore,
  riskLevel,
  type WeightedSignal,
} from "../../scoring.js";

// Calibration placeholders - tune against real project data.
// See backend/libs/risk-engines/scoring-rules/06-engineering-process-score.md
const MR_MERGE_TIME_GOOD_HOURS = 4;
const MR_MERGE_TIME_BAD_HOURS = 72;
const TIME_TO_FIRST_REVIEW_GOOD_HOURS = 2;
const TIME_TO_FIRST_REVIEW_BAD_HOURS = 48;
const REVIEW_COMMENTS_PER_MR_IDEAL = 3;
const REVIEW_COMMENTS_PER_MR_TOLERANCE = 5;
const REVIEW_COMMENTS_PER_100_LINES_IDEAL = 2;
const REVIEW_COMMENTS_PER_100_LINES_TOLERANCE = 4;
const UNRESOLVED_THREADS_GOOD = 0;
const UNRESOLVED_THREADS_BAD = 10;
// Doc's documented simplification: some iteration/rerun activity is healthy, but this
// treats both as simple lower-is-better for now.
const REVIEW_ITERATION_GOOD = 1;
const REVIEW_ITERATION_BAD = 6;
const SELF_MERGED_PR_RATE_GOOD_PERCENT = 0;
const SELF_MERGED_PR_RATE_BAD_PERCENT = 40;
const LONG_LIVED_BRANCH_GOOD = 0;
const LONG_LIVED_BRANCH_BAD = 15;
const PIPELINE_RUNS_PER_PR_GOOD = 1;
const PIPELINE_RUNS_PER_PR_BAD = 6;

const LEAD_TIME_OR_CYCLE_TIME_GOOD_DAYS = 1;
const LEAD_TIME_OR_CYCLE_TIME_BAD_DAYS = 14;
const BLOCKED_TICKET_RATIO_GOOD_PERCENT = 0;
const BLOCKED_TICKET_RATIO_BAD_PERCENT = 40;
const BLOCKED_ITEMS_AVG_AGE_GOOD_DAYS = 1;
const BLOCKED_ITEMS_AVG_AGE_BAD_DAYS = 14;
const OVERDUE_ITEMS_GOOD = 0;
const OVERDUE_ITEMS_BAD = 10;
const BLOCKED_REENTRY_GOOD = 0;
const BLOCKED_REENTRY_BAD = 5;
const BLOCKED_ITEMS_COUNT_GOOD = 0;
const BLOCKED_ITEMS_COUNT_BAD = 20;
const STALE_ISSUES_COUNT_GOOD = 0;
const STALE_ISSUES_COUNT_BAD = 20;
const STALE_MRS_COUNT_GOOD = 0;
const STALE_MRS_COUNT_BAD = 20;
const STALE_TICKET_RATIO_GOOD_PERCENT = 0;
const STALE_TICKET_RATIO_BAD_PERCENT = 40;

/** Average of whichever of the given 0..100 sub-scores are actually present. */
function averagePresent(scores: Array<number | null>): number | null {
  const present = scores.filter((s): s is number => s !== null);
  if (present.length === 0) return null;
  return present.reduce((sum, s) => sum + s, 0) / present.length;
}

export class EngineeringProcessStrategy implements EngineeringProcessRiskCalculator {
  getType(): RiskType {
    return RiskType.ENGINEERING_PROCESS;
  }

  calculate(metrics: EngineeringProcessMetrics): RiskResult {
    // "Review Comments Per MR (banded)" doc weight slot covers both per-MR and
    // per-100-lines variants (see METRICS_GAP_REPORT-style note: the doc lists both under
    // Sub-group A's metrics but only weights one row - averaging both here rather than
    // inventing a second weight).
    const reviewCommentsBandedScore = averagePresent([
      typeof metrics.reviewCommentsPerMrAvg === "number"
        ? bandedAround(metrics.reviewCommentsPerMrAvg, REVIEW_COMMENTS_PER_MR_IDEAL, REVIEW_COMMENTS_PER_MR_TOLERANCE)
        : null,
      typeof metrics.reviewCommentsPer100LinesAvg === "number"
        ? bandedAround(
            metrics.reviewCommentsPer100LinesAvg,
            REVIEW_COMMENTS_PER_100_LINES_IDEAL,
            REVIEW_COMMENTS_PER_100_LINES_TOLERANCE,
          )
        : null,
    ]);

    const signalsA: WeightedSignal[] = [
      {
        key: "selfMergedPrRate",
        weight: 0.2,
        score:
          typeof metrics.selfMergedPrRatePercent === "number"
            ? linearBetween(
                metrics.selfMergedPrRatePercent,
                SELF_MERGED_PR_RATE_GOOD_PERCENT,
                SELF_MERGED_PR_RATE_BAD_PERCENT,
              )
            : null,
      },
      {
        key: "prReviewCoverage",
        weight: 0.2,
        score:
          typeof metrics.prReviewCoveragePercent === "number"
            ? clamp(metrics.prReviewCoveragePercent)
            : null,
      },
      {
        key: "timeToFirstReview",
        weight: 0.15,
        score:
          typeof metrics.timeToFirstReviewHours === "number"
            ? linearBetween(
                metrics.timeToFirstReviewHours,
                TIME_TO_FIRST_REVIEW_GOOD_HOURS,
                TIME_TO_FIRST_REVIEW_BAD_HOURS,
              )
            : null,
      },
      {
        key: "unresolvedThreadsAtMerge",
        weight: 0.12,
        score:
          typeof metrics.unresolvedThreadsAtMergeCount === "number"
            ? linearBetween(metrics.unresolvedThreadsAtMergeCount, UNRESOLVED_THREADS_GOOD, UNRESOLVED_THREADS_BAD)
            : null,
      },
      {
        key: "mrMergeTime",
        weight: 0.1,
        score:
          typeof metrics.mrMergeTimeHours === "number"
            ? linearBetween(metrics.mrMergeTimeHours, MR_MERGE_TIME_GOOD_HOURS, MR_MERGE_TIME_BAD_HOURS)
            : null,
      },
      {
        key: "reviewCommentsBanded",
        weight: 0.08,
        score: reviewCommentsBandedScore,
      },
      {
        key: "reviewIterationCount",
        weight: 0.05,
        score:
          typeof metrics.reviewIterationCount === "number"
            ? linearBetween(metrics.reviewIterationCount, REVIEW_ITERATION_GOOD, REVIEW_ITERATION_BAD)
            : null,
      },
      {
        key: "longLivedBranchCount",
        weight: 0.05,
        score:
          typeof metrics.longLivedBranchesCount === "number"
            ? linearBetween(metrics.longLivedBranchesCount, LONG_LIVED_BRANCH_GOOD, LONG_LIVED_BRANCH_BAD)
            : null,
      },
      {
        key: "commitMessageQuality",
        weight: 0.03,
        score:
          typeof metrics.commitMessageQualityPercent === "number"
            ? clamp(metrics.commitMessageQualityPercent)
            : null,
      },
      {
        key: "avgPipelineRunsPerPr",
        weight: 0.02,
        score:
          typeof metrics.avgPipelineRunsPerPr === "number"
            ? linearBetween(metrics.avgPipelineRunsPerPr, PIPELINE_RUNS_PER_PR_GOOD, PIPELINE_RUNS_PER_PR_BAD)
            : null,
      },
    ];

    // "Issue Cycle Time / Lead Time (primary source)" is one weighted slot in the doc, not
    // two - prefer leadTimeAvgDays (richer, sprint-based) when present, otherwise fall back
    // to issueCycleTimeDays. leadTimeMedianDays/leadTimeP95Days stay contextual, unweighted.
    const leadOrCycleTimeDays = metrics.leadTimeAvgDays ?? metrics.issueCycleTimeDays;

    // "Stale Issues/MRs/Tickets (combined)" is also one weighted slot covering three
    // differently-shaped VC/Jira signals - normalize each individually, then average
    // whichever are present.
    const staleCombinedScore = averagePresent([
      typeof metrics.staleIssuesCount === "number"
        ? linearBetween(metrics.staleIssuesCount, STALE_ISSUES_COUNT_GOOD, STALE_ISSUES_COUNT_BAD)
        : null,
      typeof metrics.staleMrsCount === "number"
        ? linearBetween(metrics.staleMrsCount, STALE_MRS_COUNT_GOOD, STALE_MRS_COUNT_BAD)
        : null,
      typeof metrics.staleTicketRatio === "number"
        ? linearBetween(metrics.staleTicketRatio, STALE_TICKET_RATIO_GOOD_PERCENT, STALE_TICKET_RATIO_BAD_PERCENT)
        : null,
    ]);

    const signalsB: WeightedSignal[] = [
      {
        key: "blockedTicketRatio",
        weight: 0.2,
        score:
          typeof metrics.blockedTicketPercent === "number"
            ? linearBetween(
                metrics.blockedTicketPercent,
                BLOCKED_TICKET_RATIO_GOOD_PERCENT,
                BLOCKED_TICKET_RATIO_BAD_PERCENT,
              )
            : null,
      },
      {
        key: "issueCycleTimeOrLeadTime",
        weight: 0.2,
        score:
          typeof leadOrCycleTimeDays === "number"
            ? linearBetween(leadOrCycleTimeDays, LEAD_TIME_OR_CYCLE_TIME_GOOD_DAYS, LEAD_TIME_OR_CYCLE_TIME_BAD_DAYS)
            : null,
      },
      {
        key: "blockedItemsAvgAge",
        weight: 0.15,
        score:
          typeof metrics.blockedItemsAvgAgeDays === "number"
            ? linearBetween(
                metrics.blockedItemsAvgAgeDays,
                BLOCKED_ITEMS_AVG_AGE_GOOD_DAYS,
                BLOCKED_ITEMS_AVG_AGE_BAD_DAYS,
              )
            : null,
      },
      {
        key: "staleCombined",
        weight: 0.15,
        score: staleCombinedScore,
      },
      {
        key: "overdueItems",
        weight: 0.12,
        score:
          typeof metrics.overdueItemsCount === "number"
            ? linearBetween(metrics.overdueItemsCount, OVERDUE_ITEMS_GOOD, OVERDUE_ITEMS_BAD)
            : null,
      },
      {
        key: "blockedReentryCount",
        weight: 0.1,
        score:
          typeof metrics.blockedReentryCount === "number"
            ? linearBetween(metrics.blockedReentryCount, BLOCKED_REENTRY_GOOD, BLOCKED_REENTRY_BAD)
            : null,
      },
      {
        key: "blockedItemsCount",
        weight: 0.08,
        score:
          typeof metrics.blockedItemsCount === "number"
            ? linearBetween(metrics.blockedItemsCount, BLOCKED_ITEMS_COUNT_GOOD, BLOCKED_ITEMS_COUNT_BAD)
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
      score = clamp(resultA.score * 0.5 + resultB.score * 0.5);
      weights = [
        ...resultA.weights.map((w) => ({ key: `reviewQuality.${w.key}`, w: Math.round(w.w * 0.5 * 100) / 100 })),
        ...resultB.weights.map((w) => ({ key: `flowBottleneck.${w.key}`, w: Math.round(w.w * 0.5 * 100) / 100 })),
      ];
    }

    return {
      type: RiskType.ENGINEERING_PROCESS,
      score,
      level: riskLevel(score),
      weights,
    };
  }
}
