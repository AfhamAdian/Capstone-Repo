import { RiskResult, RiskType } from "./types.js";

export interface RiskCalculator<TMetrics> {
  getType(): RiskType;
  calculate(metrics: TMetrics): RiskResult;
}