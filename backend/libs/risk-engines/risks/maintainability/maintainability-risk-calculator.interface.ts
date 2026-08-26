import { RiskCalculator } from "../../risk-calculator.interface.js";
import { MaintainabilityMetrics } from "../../types.js";

export interface MaintainabilityRiskCalculator extends RiskCalculator<MaintainabilityMetrics> {}
