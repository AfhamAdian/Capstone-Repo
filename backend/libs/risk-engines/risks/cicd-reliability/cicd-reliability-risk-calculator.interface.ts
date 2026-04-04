import { RiskCalculator } from "../../risk-calculator.interface.js";
import { CicdReliabilityMetrics } from "../../types.js";

export interface CicdReliabilityRiskCalculator
  extends RiskCalculator<CicdReliabilityMetrics> {}
