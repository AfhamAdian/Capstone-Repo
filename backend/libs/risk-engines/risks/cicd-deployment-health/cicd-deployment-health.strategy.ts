import { CicdDeploymentHealthMetrics, RiskResult, RiskType } from "../../types.js";
import { CicdDeploymentHealthRiskCalculator } from "./cicd-deployment-health-risk-calculator.interface.js";
import {
  clamp,
  higherIsBetterCapped,
  linearBetween,
  renormalizedWeightedScore,
  riskLevel,
  type WeightedSignal,
} from "../../scoring.js";

// Calibration placeholders, loosely following DORA's published Elite/Low performer
// benchmarks (Google Cloud "Accelerate State of DevOps" report) - tune against real data.
// See backend/libs/risk-engines/scoring-rules/04-cicd-deployment-health-score.md
const DEPLOYMENTS_PER_WEEK_TARGET = 7; // ~daily deploys = elite tier
const DEPLOYMENT_FAILURE_RATE_GOOD_PERCENT = 0;
const DEPLOYMENT_FAILURE_RATE_BAD_PERCENT = 30;
const MTTR_GOOD_HOURS = 1;
const MTTR_BAD_HOURS = 48;
const CHANGE_LEAD_TIME_GOOD_HOURS = 24;
const CHANGE_LEAD_TIME_BAD_HOURS = 720;
// Floored at a realistic minimum, not 0 - an unrealistically fast pipeline may indicate
// skipped tests, not efficiency (see the doc's caveat).
const PIPELINE_DURATION_GOOD_MINUTES = 10;
const PIPELINE_DURATION_BAD_MINUTES = 60;

export class CicdDeploymentHealthStrategy implements CicdDeploymentHealthRiskCalculator {
  getType(): RiskType {
    return RiskType.CICD_DEPLOYMENT_HEALTH;
  }

  calculate(metrics: CicdDeploymentHealthMetrics): RiskResult {
    const signals: WeightedSignal[] = [
      {
        key: "deploymentFailureRate",
        weight: 0.25,
        score:
          typeof metrics.deploymentFailureRatePercent === "number"
            ? linearBetween(
                metrics.deploymentFailureRatePercent,
                DEPLOYMENT_FAILURE_RATE_GOOD_PERCENT,
                DEPLOYMENT_FAILURE_RATE_BAD_PERCENT,
              )
            : null,
      },
      {
        key: "mttr",
        weight: 0.2,
        score:
          typeof metrics.mttrHours === "number"
            ? linearBetween(metrics.mttrHours, MTTR_GOOD_HOURS, MTTR_BAD_HOURS)
            : null,
      },
      {
        key: "changeLeadTime",
        weight: 0.2,
        score:
          typeof metrics.timeToProdHours === "number"
            ? linearBetween(metrics.timeToProdHours, CHANGE_LEAD_TIME_GOOD_HOURS, CHANGE_LEAD_TIME_BAD_HOURS)
            : null,
      },
      {
        key: "deploymentFrequency",
        weight: 0.15,
        score:
          typeof metrics.deploymentsPerWeek === "number"
            ? higherIsBetterCapped(metrics.deploymentsPerWeek, DEPLOYMENTS_PER_WEEK_TARGET)
            : null,
      },
      {
        key: "pipelineSuccessRate",
        weight: 0.15,
        score:
          typeof metrics.pipelineSuccessRatePercent === "number"
            ? clamp(metrics.pipelineSuccessRatePercent)
            : null,
      },
      {
        key: "pipelineDuration",
        weight: 0.05,
        score:
          typeof metrics.avgPipelineDurationMinutes === "number"
            ? linearBetween(
                metrics.avgPipelineDurationMinutes,
                PIPELINE_DURATION_GOOD_MINUTES,
                PIPELINE_DURATION_BAD_MINUTES,
              )
            : null,
      },
    ];

    const result = renormalizedWeightedScore(signals);
    const score = result?.score ?? 0;

    return {
      type: RiskType.CICD_DEPLOYMENT_HEALTH,
      score,
      level: riskLevel(score),
      weights: result?.weights ?? [],
    };
  }
}
