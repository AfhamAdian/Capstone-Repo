import { RiskCalculator } from "../../risk-calculator.interface.js";
import { CodeQualityMetrics } from "../../types.js";

export interface CodeQualityRiskCalculator
  extends RiskCalculator<CodeQualityMetrics> {}
