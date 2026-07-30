import { RiskCalculator } from "../../risk-calculator.interface.js";
import { TeamHealthMetrics } from "../../types.js";

export interface TeamHealthRiskCalculator
  extends RiskCalculator<TeamHealthMetrics> {}
