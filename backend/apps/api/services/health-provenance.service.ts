import { env } from '../config/env.js';
import { getLatestProjectHealthScore } from '../database/project-health-score.js';
import { getIncidentSignalsForSnapshot, getLatestIncidentSignals, type IncidentSignals } from '../database/incident-signals.js';
import { getLatestRiskScoreForProject, getRiskScoreBySnapshotId, type LatestRiskScoreRow } from '../database/risk-score.js';
import { getDerivedCounts, getSurveyById } from '../database/survey.js';
import {
  CATEGORY_LABELS,
  CATEGORY_WEIGHTS,
  HEALTH_CATEGORIES,
  METRICS_WEIGHT,
  SURVEY_WEIGHT,
  blendCategory,
  describeBlend,
  roundScore,
  type HealthCategoryKey,
} from './health-score-weights.js';
import { formatSurveyIncidents } from '@libs/ai/prompts/survey-questions.prompt.js';

export interface CategoryProvenance {
  key: HealthCategoryKey;
  label: string;
  blended: number | null;
  metricsScore: number | null;
  surveyScore: number | null;
  categoryWeight: number;
  formula: string;
  surveyUsed: boolean;
}

export interface MetricSignalView {
  label: string;
  value: string;
  category: HealthCategoryKey;
}

export interface HealthProvenance {
  projectId: number;
  computedAt: string | null;
  overall: number | null;
  overallFormula: string;
  metricsWeight: number;
  surveyWeight: number;
  categoryWeights: typeof CATEGORY_WEIGHTS;
  categories: CategoryProvenance[];
  metrics: {
    used: boolean;
    snapshotId: number | null;
    snapshotTime: string | null;
    signals: MetricSignalView[];
  };
  survey: {
    used: boolean;
    withheldReason: string | null;
    surveyId: number | null;
    completedAt: string | null;
    responseCount: number | null;
    anonymityThreshold: number;
    themes: string[];
    insight: string | null;
  };
}

function metricsFor(row: LatestRiskScoreRow | null, key: HealthCategoryKey): number | null {
  if (!row) return null;
  if (key === 'delivery') return roundScore(row.delivery_score);
  if (key === 'codeQuality') return roundScore(row.code_qaulity_score);
  if (key === 'cicd') return roundScore(row.cicd_reliability_score);
  if (key === 'teamHealth') return roundScore(row.team_health_score);
  return roundScore(row.blockers_score);
}

function signalViews(incidents: IncidentSignals): MetricSignalView[] {
  return formatSurveyIncidents(incidents).map((line) => {
    const lower = line.toLowerCase();
    let category: HealthCategoryKey = 'delivery';
    if (lower.includes('blocked') || lower.includes('due date')) category = 'blockers';
    else if (lower.includes('deploy') || lower.includes('pipeline')) category = 'cicd';
    else if (lower.includes('pull request') || lower.includes('pr review') || lower.includes('commit')) category = 'codeQuality';
    return { label: line.replace(/\.$/, ''), value: line, category };
  });
}

export async function getProjectHealthProvenance(projectId: number): Promise<HealthProvenance | null> {
  const health = await getLatestProjectHealthScore(projectId);
  if (!health) return null;

  const storedBlended: Record<HealthCategoryKey, number | null> = {
    delivery: roundScore(health.delivery_score),
    codeQuality: roundScore(health.code_quality_score),
    cicd: roundScore(health.cicd_score),
    teamHealth: roundScore(health.team_health_score),
    blockers: roundScore(health.blockers_score),
  };

  const [riskScore, survey, incidents] = await Promise.all([
    health.project_snapshot_id
      ? getRiskScoreBySnapshotId(health.project_snapshot_id)
      : getLatestRiskScoreForProject(projectId),
    health.survey_id ? getSurveyById(health.survey_id) : Promise.resolve(null),
    health.project_snapshot_id
      ? getIncidentSignalsForSnapshot(health.project_snapshot_id)
      : getLatestIncidentSignals(projectId),
  ]);

  const counts = survey ? await getDerivedCounts(survey.id) : null;
  const insight = survey?.insight ?? null;
  const belowThreshold =
    counts !== null && counts.responseCount < env.surveyMinAnonymousResponses;
  const surveyUsed = Boolean(insight?.scores);

  const categories: CategoryProvenance[] = HEALTH_CATEGORIES.map((key) => {
    const metricsScore = metricsFor(riskScore, key);
    const surveyScore = roundScore(insight?.scores?.[key] ?? null);
    return {
      key,
      label: CATEGORY_LABELS[key],
      blended: storedBlended[key] ?? blendCategory(metricsScore, surveyScore),
      metricsScore,
      surveyScore,
      categoryWeight: CATEGORY_WEIGHTS[key],
      formula: describeBlend(metricsScore, surveyScore),
      surveyUsed: surveyScore !== null,
    };
  });

  return {
    projectId,
    computedAt: health.computed_at,
    overall: roundScore(health.overall_score),
    overallFormula: `Weighted average of category scores (Delivery ${CATEGORY_WEIGHTS.delivery * 100}% · Code Quality ${CATEGORY_WEIGHTS.codeQuality * 100}% · CI/CD ${CATEGORY_WEIGHTS.cicd * 100}% · Team Health ${CATEGORY_WEIGHTS.teamHealth * 100}% · Blockers ${CATEGORY_WEIGHTS.blockers * 100}%). Each category is ${METRICS_WEIGHT * 100}% tool metrics + ${SURVEY_WEIGHT * 100}% survey sentiment.`,
    metricsWeight: METRICS_WEIGHT,
    surveyWeight: SURVEY_WEIGHT,
    categoryWeights: CATEGORY_WEIGHTS,
    categories,
    metrics: {
      used: riskScore !== null,
      snapshotId: incidents.snapshotId ?? health.project_snapshot_id,
      snapshotTime: incidents.snapshotTime,
      signals: signalViews(incidents),
    },
    survey: {
      used: surveyUsed,
      withheldReason: belowThreshold
        ? `Raw answers hidden: ${counts.responseCount}/${env.surveyMinAnonymousResponses} anonymous responses (threshold not met). Category scores ${surveyUsed ? 'were still blended' : 'were not blended'}.`
        : null,
      surveyId: survey?.id ?? null,
      completedAt: survey?.completed_at ?? null,
      responseCount: counts?.responseCount ?? null,
      anonymityThreshold: env.surveyMinAnonymousResponses,
      themes: insight?.themes ?? [],
      insight: insight?.aiInsight ?? null,
    },
  };
}
