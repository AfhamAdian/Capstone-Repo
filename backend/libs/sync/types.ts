/**
 * Shared sync pipeline types and contracts
 */

/**
 * Supported tool categories and providers
 */
export type ToolCategory = 'vcs' | 'projectManagement' | 'cicd' | 'codeQuality';
export type VcsProvider = 'github' | 'gitlab' | 'bitbucket';
export type ProjectManagementProvider = 'jira' | 'trello' | 'asana';
export type CicdProvider = 'jenkins' | 'circleci' | 'travisci';
export type CodeQualityProvider = 'sonarqube' | 'codeclimate' | 'codacy';

export type SupportedTool = VcsProvider | ProjectManagementProvider;

/**
 * Sync job request payload
 */
export interface SyncRequestPayload {
  projectId: string;
  tools: SupportedTool[];
  sessionId: string;
  integrations?: Record<string, {
    credentials?: Record<string, string | undefined>;
    project?: Record<string, string | undefined>;
  }>;
}

/**
 * Sync job record
 */
export interface SyncJob {
  id: string;
  projectId: string;
  tools: SupportedTool[];
  sessionId: string;
  status: 'queued' | 'in-progress' | 'completed' | 'failed';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

/**
 * Per-tool sync progress event
 */
export interface SyncProgressEvent {
  jobId: string;
  sessionId: string;
  tool: SupportedTool | 'risk';
  status: 'queued' | 'syncing' | 'calculating-risk' | 'completed' | 'failed';
  timestamp: Date;
  error?: string;
}

/**
 * Sync completion event with risk score
 */
export interface SyncCompletionEvent {
  jobId: string;
  sessionId: string;
  status: 'success' | 'partial' | 'failed';
  timestamp: Date;
  toolsCompleted: SupportedTool[];
  toolsFailed: SupportedTool[];
  riskScore?: number;
  error?: string;
}

/**
 * Normalized connector output
 */
export interface ConnectorOutput {
  tool: SupportedTool;
  provider: string;
  data: unknown;
  fetchedAt: Date;
}

/**
 * Sync job item - tracks individual tool sync within a job
 */
export interface SyncJobItem {
  id: string;
  jobId: string;
  tool: SupportedTool;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  connectorOutput?: ConnectorOutput;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}
