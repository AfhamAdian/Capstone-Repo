/**
 * PM Strategy Factory
 * Creates the appropriate strategy based on provider
 */

import { CreatePmStrategyInput, PmProvider } from './types.js';
import { IPmStrategy } from './pm-strategy.interface.js';
import { JiraStrategy } from './jira.strategy.js';
import { LinearStrategy } from './linear.strategy.js';

export function createPmStrategy(input: CreatePmStrategyInput): IPmStrategy {
  const provider = input.provider as PmProvider;

  switch (provider) {
    case 'jira':
      return new JiraStrategy(input);
    case 'linear':
      return new LinearStrategy(input);
    default:
      throw new Error(`Unsupported PM provider: ${provider}`);
  }
}
