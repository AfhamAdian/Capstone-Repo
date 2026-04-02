/**
 * GitLab VCS Strategy Implementation
 */

import { IVcsStrategy } from './vcs-strategy.interface.js';
import { CreateVcsStrategyInput } from './types.js';

export class GitLabStrategy implements IVcsStrategy {
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

  async getData(): Promise<unknown> {
    // Implementation to be added
    throw new Error('getData() not yet implemented for GitLab');
  }
}
