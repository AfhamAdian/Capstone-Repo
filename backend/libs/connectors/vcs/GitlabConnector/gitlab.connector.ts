/**
 * GitLab VCS Connector Implementation
 */

import { IVcsConnector } from '../connector.interface.js';
import { CreateVcsConnectorInput } from '../types.js';
import type { IConnector, ConnectorOutput } from '@libs/sync/index.js';

export class GitLabConnector implements IVcsConnector, IConnector {
  private credentials: { token: string; baseUrl?: string };
  private project: { path?: string; id?: string };

  constructor(input: CreateVcsConnectorInput) {
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
