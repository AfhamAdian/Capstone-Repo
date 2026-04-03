import {
  CicdReliabilityMetrics,
  CodeQualityMetrics,
  DeliveryMetrics,
  EngineeringProcessMetrics,
  RiskMetricsByType,
  RiskResult,
  RiskType,
  SecurityRiskMetrics,
  TeamHealthMetrics,
} from "./types.js";
import { DeliveryStrategy } from "./risks/delivery.risk.js";
import { CodeQualityStrategy } from "./risks/code-quality.risk.js";
import { EngineeringProcessStrategy } from "./risks/engineering-process.risk.js";
import { CicdReliabilityStrategy } from "./risks/cicd-reliability.risk.js";
import { TeamHealthStrategy } from "./risks/team-health.risk.js";
import { SecurityRiskStrategy } from "./risks/security-risk.risk.js";
import { saveRiskScore } from "../../apps/api/src/database/risk-score.js";

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

    if (type === RiskType.SECURITY_RISK) {
      return new SecurityRiskStrategy().calculate(metrics as SecurityRiskMetrics);
    }

    throw new Error(`Strategy for risk type ${type} not implemented.`);
  }

  public getLevel(score: number): "LOW" | "MEDIUM" | "HIGH" {
    if (score >= 70) return "HIGH";
    if (score >= 40) return "MEDIUM";
    return "LOW";
  }

  public async saveToDB(result: RiskResult): Promise<void> {
    await saveRiskScore(result);
  }
}