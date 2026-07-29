import { RiskCalculator } from "../../risk-calculator.interface.js";
import { BlockersMetrics } from "../../types.js";

export interface BlockersRiskCalculator
  extends RiskCalculator<BlockersMetrics> {}
