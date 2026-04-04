/**
 * Connector registry and factory
 * Maps tool names to connector implementations
 */

import type { SupportedTool } from './types.js';
import type { IConnector, CreateConnectorInput } from './connector.interface.js';
import { GitHubStrategy } from '@libs/connectors/vcs/github.strategy.js';
import { GitLabStrategy } from '@libs/connectors/vcs/gitlab.strategy.js';
// import { JiraConnector } from '@libs/connectors/projectManagement/jira.connector.js';

/**
 * Connector registry maps tool names to their factory functions
 */
const connectorRegistry: Record<SupportedTool, (input: CreateConnectorInput) => IConnector> = {
  // VCS providers
  github: (input) => new GitHubStrategy({
    provider: 'github',
    credentials: input.credentials,
    project: input.project,
  }),
  gitlab: (input) => new GitLabStrategy({
    provider: 'gitlab',
    credentials: input.credentials,
    project: input.project,
  }),
  // Project management providers
  // jira: (input) => new JiraConnector(input),
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
