/**
 * PM (Project Management) connector types and interfaces
 */

export type PmProvider = 'jira' | 'linear';

export interface PmCredentials {
  token: string;
  email?: string; // Required for Jira
  baseUrl?: string; // For self-hosted instances
}

export interface PmProject {
  projectKey?: string; // Jira: project key (e.g., "PROJ")
  projectId?: string; // Jira: numeric project ID
  boardId?: string; // Jira: board ID for sprint data
}

export interface CreatePmStrategyInput {
  provider: PmProvider;
  credentials: PmCredentials;
  project: PmProject;
}
