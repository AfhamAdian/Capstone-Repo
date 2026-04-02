/**
 * VCS Strategy Factory
 * Creates the appropriate strategy based on provider
 */

import { CreateVcsStrategyInput, VcsProvider } from './types';
import { IVcsStrategy } from './vcs-strategy.interface';
import { GitHubStrategy } from './github.strategy';
import { GitLabStrategy } from './gitlab.strategy';

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
