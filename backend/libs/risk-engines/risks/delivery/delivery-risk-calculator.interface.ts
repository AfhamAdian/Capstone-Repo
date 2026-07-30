import { RiskCalculator } from "../../risk-calculator.interface.js";
import { DeliveryMetrics } from "../../types.js";

export interface DeliveryRiskCalculator
  extends RiskCalculator<DeliveryMetrics> {}
