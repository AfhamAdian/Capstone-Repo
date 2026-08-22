/** Shared 60/40 blend recipe used by scoring, provenance, and the dashboard inspector. */

export const METRICS_WEIGHT = 0.6;
export const SURVEY_WEIGHT = 0.4;

export const CATEGORY_WEIGHTS = {
  delivery: 0.25,
  codeQuality: 0.2,
  cicd: 0.2,
  teamHealth: 0.2,
  blockers: 0.15,
} as const;

export type HealthCategoryKey = keyof typeof CATEGORY_WEIGHTS;

export const CATEGORY_LABELS: Record<HealthCategoryKey, string> = {
  delivery: 'Delivery',
  codeQuality: 'Code Quality',
  cicd: 'CI/CD',
  teamHealth: 'Team Health',
  blockers: 'Blockers',
};

export const HEALTH_CATEGORIES = Object.keys(CATEGORY_WEIGHTS) as HealthCategoryKey[];

export function roundScore(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.round(value);
}

export function blendCategory(metricsScore: number | null, surveyScore: number | null): number | null {
  if (metricsScore === null && surveyScore === null) return null;
  if (surveyScore === null) return roundScore(metricsScore);
  if (metricsScore === null) return roundScore(surveyScore);
  return roundScore(metricsScore * METRICS_WEIGHT + surveyScore * SURVEY_WEIGHT);
}

export function describeBlend(metricsScore: number | null, surveyScore: number | null): string {
  const metrics = roundScore(metricsScore);
  const survey = roundScore(surveyScore);
  if (metrics === null && survey === null) return 'No metrics or survey data for this category.';
  if (survey === null) return `Metrics only: ${metrics}`;
  if (metrics === null) return `Survey only: ${survey}`;
  return `${METRICS_WEIGHT} × ${metrics} + ${SURVEY_WEIGHT} × ${survey} = ${blendCategory(metrics, survey)}`;
}

export function blendOverall(
  categoryScores: Record<HealthCategoryKey, number | null>,
): number | null {
  const weighted = HEALTH_CATEGORIES.map((key) => [categoryScores[key], CATEGORY_WEIGHTS[key]] as const);
  const presentWeight = weighted.filter(([score]) => score !== null).reduce((sum, [, weight]) => sum + weight, 0);
  if (presentWeight <= 0) return null;
  return roundScore(weighted.reduce((sum, [score, weight]) => sum + (score ?? 0) * weight, 0) / presentWeight);
}
