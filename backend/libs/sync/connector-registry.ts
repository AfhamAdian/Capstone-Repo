/**
 * Connector registry and factory
 * Maps tool names to connector implementations
 */

import type { SupportedTool } from './types.js';
import type { IConnector, CreateConnectorInput } from './connector.interface.js';
import { GitHubConnector } from '@libs/connectors/vcs/GithubConnector/github.connector.js';
import { GitLabConnector } from '@libs/connectors/vcs/GitlabConnector/gitlab.connector.js';
import { JiraConnector } from '@libs/connectors/pm/JiraConnector/jira.connector.js';

/**
 * Connector registry maps tool names to their factory functions
 */
const connectorRegistry: Partial<Record<SupportedTool, (input: CreateConnectorInput) => IConnector>> = {
  // VCS providers
  github: (input) => new GitHubConnector({
    provider: 'github',
    credentials: {
      token: input.credentials.token ?? '',
    },
    project: {
      owner: input.project.owner ?? '',
      repo: input.project.repo ?? '',
    },
  }),
  gitlab: (input) => new GitLabConnector({
    provider: 'gitlab',
    credentials: {
      token: input.credentials.token ?? '',
    },
    project: {
      owner: input.project.owner ?? '',
      repo: input.project.repo ?? '',
    },
  }),
  // Project management providers
  jira: (input) => new JiraConnector({
    provider: 'jira',
    credentials: {
      token: input.credentials.token ?? '',
      email: input.credentials.email,
      baseUrl: input.credentials.baseUrl,
    },
    project: {
      projectKey: input.project.projectKey ?? input.project.key,
      boardId: input.project.boardId,
    },
  }),
} as const;

/**
 * Create a connector instance for the given tool
 */
export function createConnector(input: CreateConnectorInput): IConnector {
  const factory = connectorRegistry[input.tool];

  if (!factory) {
    throw new Error(`Unsupported tool: ${input.tool}. Available: ${Object.keys(connectorRegistry).join(', ')}`);
  }

  return factory(input);
}

/**
 * Get list of supported tools
 */
export function getSupportedTools(): SupportedTool[] {
  return Object.keys(connectorRegistry) as SupportedTool[];
}
