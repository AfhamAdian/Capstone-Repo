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

export interface PmConnectorOptions {
  storyPointsFieldKey?: string; // Jira: custom field id for story points (instance-specific)
  epicLinkFieldKey?: string; // Jira: custom field id for Epic Link on company-managed projects (instance-specific; team-managed projects use the built-in `parent` field instead)
}

export interface CreatePmConnectorInput {
  provider: PmProvider;
  credentials: PmCredentials;
  project: PmProject;
  options?: PmConnectorOptions;
}
