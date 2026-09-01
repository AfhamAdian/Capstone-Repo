/**
 * AI client contract for the survey feature: question generation and
 * post-hoc response analysis. Kept provider-agnostic so the concrete
 * implementation (Gemini today) can be swapped via client-factory.ts.
 */

/** The 7 rubric buckets that scoring is fixed to — mirrors the risk-engine's own categories (riskscore table). */
export type SurveyQuestionCategory =
  | 'security' | 'reliability' | 'maintainability' | 'cicdDeploymentHealth' | 'teamHealth' | 'engineeringProcess' | 'planningExecution';
export type SurveyQuestionType = 'text' | 'scale';

/**
 * Immutable project-health snapshot captured when a survey draft is generated.
 * Gemini receives this as context, while survey sentiment is still scored from
 * response evidence independently to avoid circular health calculations.
 */
/**
 * Immutable project-health snapshot captured when a survey draft is generated.
 * Gemini receives this as context, while survey sentiment is still scored from
 * response evidence independently to avoid circular health calculations.
 */
export interface SurveyIncidentSignals {
  snapshotId: number | null;
  snapshotTime: string | null;
  spilloverRatio: number | null;
  consecutiveSpilloverCount: number | null;
  blockedItemsCount: number | null;
  overdueItemsCount: number | null;
  scopeChurnRatio: number | null;
  midSprintAdditions: number | null;
  deploymentsPerWeek: number | null;
  deploymentFailureRatePercent: number | null;
  pipelineSuccessRatePercent: number | null;
  stalePrCount: number | null;
  prCycleTimeHours: number | null;
  commitsPerWeek: number | null;
}

/** How a score moved since the previous sync's risk score. `delta` is current - previous (higher score = healthier). */
export type HealthTrendLabel = 'steady' | 'gradual_increase' | 'gradual_decrease' | 'sharp_increase' | 'sharp_decrease' | 'unknown';

export interface CategoryTrend {
  delta: number | null;
  label: HealthTrendLabel;
}

export interface SurveyHealthContext {
  capturedAt: string;
  overallScore: number | null;
  scores: {
    security: number | null;
    reliability: number | null;
    maintainability: number | null;
    cicdDeploymentHealth: number | null;
    teamHealth: number | null;
    engineeringProcess: number | null;
    planningExecution: number | null;
  };
  metricsSnapshotId: number | null;
  source: 'risk_score' | 'unavailable';
  /** Last-cycle delivery/CI facts. Optional so older stored surveys still parse. */
  incidents?: SurveyIncidentSignals | null;
  /** Movement vs the previous sync's risk score. Optional - omitted when there's no prior snapshot to compare against. */
  trend?: {
    previousCapturedAt: string | null;
    overall: CategoryTrend;
    security: CategoryTrend;
    reliability: CategoryTrend;
    maintainability: CategoryTrend;
    cicdDeploymentHealth: CategoryTrend;
    teamHealth: CategoryTrend;
    engineeringProcess: CategoryTrend;
    planningExecution: CategoryTrend;
  };
}

export interface GeneratedSurveyQuestion {
  /** One of the seven rubric keys: security, reliability, maintainability, cicdDeploymentHealth, teamHealth, engineeringProcess, planningExecution. */
  category: string;
  questionText: string;
  questionType: SurveyQuestionType;
}

export interface GenerateSurveyQuestionsInput {
  trigger: string;
  customGuidance?: string;
  projectName: string;
  /** Valid category keys (data-driven via custom categories). Defaults to the seven built-ins when omitted. */
  categories?: string[];
  healthContext?: SurveyHealthContext;
}

/**
 * LLM evaluation of a single generated question across the four quality
 * dimensions (each 0-100). `overall` is the LLM's holistic score, used as the
 * quality gate; `diversity` reflects how distinct the question is from the rest
 * of the batch. `reason` is a short human-readable justification for the modal.
 */
export interface QuestionScore {
  relevance: number;
  clarity: number;
  importance: number;
  diversity: number;
  overall: number;
  reason?: string;
}

export interface ScoredSurveyQuestion extends GeneratedSurveyQuestion {
  score: QuestionScore;
}

export interface ScoreSurveyQuestionsInput {
  projectName: string;
  trigger: string;
  questions: GeneratedSurveyQuestion[];
  healthContext?: SurveyHealthContext;
}

export interface RawSurveyResponseForAnalysis {
  question: string;
  category: SurveyQuestionCategory;
  answers: string[];
}

export interface SurveyCategoryScores {
  security: number;
  reliability: number;
  maintainability: number;
  cicdDeploymentHealth: number;
  teamHealth: number;
  engineeringProcess: number;
  planningExecution: number;
}

export interface AnalyzeSurveyResponsesInput {
  projectName: string;
  rawResponses: RawSurveyResponseForAnalysis[];
  healthContext?: SurveyHealthContext;
}

export interface AnalyzeSurveyResponsesOutput {
  scores: SurveyCategoryScores;
  themes: string[];
  aiInsight: string;
}

export interface AiClient {
  generateSurveyQuestions(input: GenerateSurveyQuestionsInput): Promise<GeneratedSurveyQuestion[]>;
  /** Scores each candidate question on relevance/clarity/importance/diversity so the service can gate on quality. Order matches the input. */
  scoreSurveyQuestions(input: ScoreSurveyQuestionsInput): Promise<QuestionScore[]>;
  analyzeSurveyResponses(input: AnalyzeSurveyResponsesInput): Promise<AnalyzeSurveyResponsesOutput>;
}
