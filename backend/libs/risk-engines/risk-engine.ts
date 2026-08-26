import {
  CicdReliabilityMetrics,
  CodeQualityMetrics,
  DeliveryMetrics,
  EngineeringProcessMetrics,
  RiskMetricsByType,
  RiskResult,
  RiskType,
  SecurityMetrics,
  TeamHealthMetrics,
  BlockersMetrics,
} from "./types.js";
import { DeliveryStrategy } from "./risks/delivery/delivery.strategy.js";
import { CodeQualityStrategy } from "./risks/code-quality/code-quality.strategy.js";
import { EngineeringProcessStrategy } from "./risks/engineering-process/engineering-process.strategy.js";
import { CicdReliabilityStrategy } from "./risks/cicd-reliability/cicd-reliability.strategy.js";
import { TeamHealthStrategy } from "./risks/team-health/team-health.strategy.js";
import { SecurityStrategy } from "./risks/security/security.strategy.js";
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

    if (type === RiskType.CODE_QUALITY) {
      return new CodeQualityStrategy().calculate(metrics as CodeQualityMetrics);
    }

    if (type === RiskType.ENGINEERING_PROCESS) {
      return new EngineeringProcessStrategy().calculate(
        metrics as EngineeringProcessMetrics
      );
    }

    if (type === RiskType.CICD_RELIABILITY) {
      return new CicdReliabilityStrategy().calculate(
        metrics as CicdReliabilityMetrics
      );
    }

    if (type === RiskType.TEAM_HEALTH) {
      return new TeamHealthStrategy().calculate(metrics as TeamHealthMetrics);
    }

    if (type === RiskType.SECURITY) {
      return new SecurityStrategy().calculate(metrics as SecurityMetrics);
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