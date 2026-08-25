/**
 * VCS Connector Interface
 * Defines contract for all VCS provider implementations
 */

import type { SupportedTool } from '@libs/sync/index.js';

/**
 * Normalized VCS connector output, typed over the provider's metrics shape.
 * Structurally compatible with the sync layer's `ConnectorOutput` (data: unknown),
 * since TMetrics defaults to unknown and narrows for providers that specify it.
 */
export interface VcsConnectorOutput<TMetrics = unknown> {
  tool: SupportedTool;
  provider: string;
  data: TMetrics;
  fetchedAt: Date;
}

export interface IVcsConnector<TMetrics = unknown> {
  /**
   * Fetch metrics from the VCS provider
   */
  getData(): Promise<VcsConnectorOutput<TMetrics>>;
}
