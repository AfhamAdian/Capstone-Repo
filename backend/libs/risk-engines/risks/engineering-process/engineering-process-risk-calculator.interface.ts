import { RiskCalculator } from "../../risk-calculator.interface.js";
import { EngineeringProcessMetrics } from "../../types.js";

export interface EngineeringProcessRiskCalculator
  extends RiskCalculator<EngineeringProcessMetrics> {}
