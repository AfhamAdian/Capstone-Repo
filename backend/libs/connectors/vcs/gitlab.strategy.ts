/**
 * GitLab VCS Strategy Implementation
 */

import { IVcsStrategy } from './vcs-strategy.interface.js';
import { CreateVcsStrategyInput } from './types.js';
import type { IConnector, ConnectorOutput } from '@libs/sync/connector.interface.js';

export class GitLabStrategy implements IVcsStrategy, IConnector {
  private credentials: { token: string; baseUrl?: string };
  private project: { path?: string; id?: string };

  constructor(input: CreateVcsStrategyInput) {
    if (!input.credentials.token) {
      throw new Error('GitLab token is required');
    }
    if (!input.project.path && !input.project.id) {
      throw new Error('GitLab project path or ID is required');
    }

    this.credentials = {
      token: input.credentials.token,
      baseUrl: input.credentials.baseUrl,
    };
    this.project = {
      path: input.project.path,
      id: input.project.id,
    };
  }

  async getData(): Promise<ConnectorOutput> {
    // TODO: Implement GitLab metrics fetching
    // For now, throw error to indicate not yet fully implemented
    throw new Error('getData() not yet fully implemented for GitLab');
  }
}
