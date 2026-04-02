/**
 * VCS module exports
 */

export { IVcsStrategy } from './vcs-strategy.interface.js';
export { GitHubStrategy } from './github.strategy.js';
export { GitLabStrategy } from './gitlab.strategy.js';
export { createVcsStrategy } from './factory.js';
export type { CreateVcsStrategyInput, VcsCredentials, VcsProject, VcsProvider } from './types.js';
export type { GitHubMetricsResponse } from './github-metrics.types.js';
