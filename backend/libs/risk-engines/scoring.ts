/**
 * Shared risk-scoring helpers.
 *
 * Null-aware weighted scoring: only signals that are actually present
 * contribute, and their weights are renormalized to sum to 1 — so a missing
 * input (e.g. null coverage, an absent trend) neither drags the score down
 * nor silently distorts the weighting.
 */

import type { RiskWeight } from "./types.js";

export interface WeightedSignal {
  key: string;
  /** 0..100 health score for this signal, or null/undefined if the input is absent. */
  score: number | null | undefined;
  weight: number;
}

export interface RenormalizedScore {
  score: number; // 0..100
  weights: RiskWeight[]; // effective (renormalized) weights actually applied
}

/** Clamp a value into a range (defaults to a 0..100 score range). */
export function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Convert a raw metric value into a 0..100 signal score, or null if the
 * metric is absent. Keeps strategies free of repetitive null checks.
 */
export function toScore(
  value: number | null | undefined,
  toScoreFn: (value: number) => number,
): number | null {
  return typeof value === "number" && Number.isFinite(value) ? toScoreFn(value) : null;
}

/**
 * Weighted average over only the present signals, with weights renormalized
 * to sum to 1. Returns null when no signal is present.
 */
export function renormalizedWeightedScore(signals: WeightedSignal[]): RenormalizedScore | null {
  const present = signals.filter(
    (signal): signal is WeightedSignal & { score: number } =>
      typeof signal.score === "number" && Number.isFinite(signal.score) && signal.weight > 0,
  );

  const totalWeight = present.reduce((sum, signal) => sum + signal.weight, 0);
  if (present.length === 0 || totalWeight === 0) {
    return null;
  }

  const rawScore =
    present.reduce((sum, signal) => sum + signal.score * signal.weight, 0) / totalWeight;

  return {
    score: clamp(rawScore),
    weights: present.map((signal) => ({
      key: signal.key,
      w: Math.round((signal.weight / totalWeight) * 100) / 100,
    })),
  };
}

export function riskLevel(score: number): "LOW" | "MEDIUM" | "HIGH" {
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}
