import { RiskCalculator } from "../../risk-calculator.interface.js";
import { CicdDeploymentHealthMetrics } from "../../types.js";

export interface CicdDeploymentHealthRiskCalculator
  extends RiskCalculator<CicdDeploymentHealthMetrics> {}
