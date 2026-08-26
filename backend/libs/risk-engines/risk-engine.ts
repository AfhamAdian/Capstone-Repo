import {
  CicdDeploymentHealthMetrics,
  MaintainabilityMetrics,
  DeliveryMetrics,
  EngineeringProcessMetrics,
  RiskMetricsByType,
  RiskResult,
  RiskType,
  SecurityMetrics,
  ReliabilityMetrics,
  TeamHealthMetrics,
  BlockersMetrics,
} from "./types.js";
import { DeliveryStrategy } from "./risks/delivery/delivery.strategy.js";
import { MaintainabilityStrategy } from "./risks/maintainability/maintainability.strategy.js";
import { EngineeringProcessStrategy } from "./risks/engineering-process/engineering-process.strategy.js";
import { CicdDeploymentHealthStrategy } from "./risks/cicd-deployment-health/cicd-deployment-health.strategy.js";
import { TeamHealthStrategy } from "./risks/team-health/team-health.strategy.js";
import { SecurityStrategy } from "./risks/security/security.strategy.js";
import { ReliabilityStrategy } from "./risks/reliability/reliability.strategy.js";
import { BlockersStrategy } from "./risks/blockers/blockers.strategy.js";
import { saveRiskScore } from "../../apps/api/database/risk-score.js";

export class RiskEngine {
  public calculateRisk<TType extends RiskType>(
    type: TType,
    metrics: RiskMetricsByType[TType]
  ): RiskResult {
    if (type === RiskType.DELIVERY) {
      return new DeliveryStrategy().calculate(metrics as DeliveryMetrics);
    }

    if (type === RiskType.MAINTAINABILITY) {
      return new MaintainabilityStrategy().calculate(metrics as MaintainabilityMetrics);
    }

    if (type === RiskType.ENGINEERING_PROCESS) {
      return new EngineeringProcessStrategy().calculate(
        metrics as EngineeringProcessMetrics
      );
    }

    if (type === RiskType.CICD_DEPLOYMENT_HEALTH) {
      return new CicdDeploymentHealthStrategy().calculate(
        metrics as CicdDeploymentHealthMetrics
      );
    }

    if (type === RiskType.TEAM_HEALTH) {
      return new TeamHealthStrategy().calculate(metrics as TeamHealthMetrics);
    }

    if (type === RiskType.SECURITY) {
      return new SecurityStrategy().calculate(metrics as SecurityMetrics);
    }

    if (type === RiskType.RELIABILITY) {
      return new ReliabilityStrategy().calculate(metrics as ReliabilityMetrics);
    }

    if (type === RiskType.BLOCKERS) {
      return new BlockersStrategy().calculate(metrics as BlockersMetrics);
    }

    throw new Error(`Strategy for risk type ${type} not implemented.`);
  }

  public getLevel(score: number): "LOW" | "MEDIUM" | "HIGH" {
    if (score >= 70) return "HIGH";
    if (score >= 40) return "MEDIUM";
    return "LOW";
  }

  public async saveToDB(result: RiskResult, projectSnapshotId: number): Promise<void> {
    await saveRiskScore(result, projectSnapshotId);
  }
}