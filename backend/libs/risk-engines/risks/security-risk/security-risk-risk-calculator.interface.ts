import { RiskCalculator } from "../../risk-calculator.interface.js";
import { SecurityRiskMetrics } from "../../types.js";

export interface SecurityRiskRiskCalculator
  extends RiskCalculator<SecurityRiskMetrics> {}
