/**
 * GitHub VCS Strategy Implementation
 */

import { IVcsStrategy } from './vcs-strategy.interface';
import { CreateVcsStrategyInput } from './types';

export class GitHubStrategy implements IVcsStrategy {
  private credentials: { token: string };
  private project: { owner: string; repo: string };

  constructor(input: CreateVcsStrategyInput) {
    if (!input.credentials.token) {
      throw new Error('GitHub token is required');
    }
    if (!input.project.owner || !input.project.repo) {
      throw new Error('GitHub owner and repo are required');
    }

    this.credentials = { token: input.credentials.token };
    this.project = {
      owner: input.project.owner,
      repo: input.project.repo,
    };
  }

  async getData(): Promise<any> {
    // Implementation to be added
    throw new Error('getData() not yet implemented for GitHub');
  }
}
