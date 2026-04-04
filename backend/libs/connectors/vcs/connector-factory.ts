/**
 * VCS Connector Factory
 * Creates the appropriate connector based on provider
 */

import { CreateVcsConnectorInput, VcsProvider } from './types.js';
import { IVcsConnector } from './connector.interface.js';
import { GitHubConnector } from './GithubConnector/github.connector.js';
import { GitLabConnector } from './GitlabConnector/gitlab.connector.js';

export function createVcsConnector(input: CreateVcsConnectorInput): IVcsConnector {
  const provider = input.provider as VcsProvider;

  switch (provider) {
    case 'github':
      return new GitHubConnector(input);
    case 'gitlab':
      return new GitLabConnector(input);
    default:
      throw new Error(`Unsupported VCS provider: ${provider}`);
  }
}