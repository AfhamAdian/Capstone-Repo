/**
 * VCS (Version Control System) connector types and interfaces
 */

export type VcsProvider = 'github' | 'gitlab';

export interface VcsCredentials {
  token: string;
  baseUrl?: string; // For self-hosted GitLab instances
}

export interface VcsProject {
  owner?: string; // GitHub: owner
  repo?: string; // GitHub: repository name
  path?: string; // GitLab: group/project
  id?: string; // GitLab: project ID (numeric or encoded)
}

export interface CreateVcsStrategyInput {
  provider: VcsProvider;
  credentials: VcsCredentials;
  project: VcsProject;
}
