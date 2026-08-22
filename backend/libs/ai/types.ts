/**
 * AI client contract for the survey feature: question generation and
 * post-hoc response analysis. Kept provider-agnostic so the concrete
 * implementation (Gemini today) can be swapped via client-factory.ts.
 */

/** The 5 rubric buckets that scoring/blending is fixed to. */
export type SurveyQuestionCategory = 'delivery' | 'codeQuality' | 'cicd' | 'teamHealth' | 'blockers';
export type SurveyQuestionType = 'text' | 'scale';

/**
 * Immutable project-health snapshot captured when a survey draft is generated.
 * Gemini receives this as context, while survey sentiment is still scored from
 * response evidence independently to avoid circular health calculations.
 */
export interface SurveyHealthContext {
  capturedAt: string;
  overallScore: number | null;
  scores: {
    delivery: number | null;
    codeQuality: number | null;
    cicd: number | null;
    teamHealth: number | null;
    blockers: number | null;
  };
  trendDelta: number | null;
  metricsSnapshotId: number | null;
  source: 'project_health_score' | 'unavailable';
}

export interface GeneratedSurveyQuestion {
  /** One of the five rubric keys: delivery, codeQuality, cicd, teamHealth, blockers. */
  category: string;
  questionText: string;
  questionType: SurveyQuestionType;
}

export interface GenerateSurveyQuestionsInput {
  trigger: string;
  customGuidance?: string;
  projectName: string;
  /** Valid category keys (data-driven via custom categories). Defaults to the five built-ins when omitted. */
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
  delivery: number;
  codeQuality: number;
  cicd: number;
  teamHealth: number;
  blockers: number;
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
