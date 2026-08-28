import { RiskCalculator } from "../../risk-calculator.interface.js";
import { SecurityMetrics } from "../../types.js";

export interface SecurityRiskCalculator extends RiskCalculator<SecurityMetrics> {}
