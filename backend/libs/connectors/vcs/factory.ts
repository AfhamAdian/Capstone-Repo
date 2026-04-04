/**
 * VCS Strategy Factory
 * Creates the appropriate strategy based on provider
 */

import { CreateVcsStrategyInput, VcsProvider } from './types.js';
import { IVcsStrategy } from './vcs-strategy.interface.js';
import { GitHubStrategy } from './github.strategy.js';
import { GitLabStrategy } from './gitlab.strategy.js';

export function createVcsStrategy(input: CreateVcsStrategyInput): IVcsStrategy {
  const provider = input.provider as VcsProvider;

  switch (provider) {
    case 'github':
      return new GitHubStrategy(input);
    case 'gitlab':
      return new GitLabStrategy(input);
    default:
      throw new Error(`Unsupported VCS provider: ${provider}`);
  }
}