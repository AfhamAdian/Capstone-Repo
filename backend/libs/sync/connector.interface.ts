/**
 * Base connector interface for all tool types
 * Generalized abstraction above VCS-specific approach
 */

import type { SupportedTool, ConnectorOutput } from './types.js';

/**
 * Connector credentials - flexible interface for different tool types
 */
export interface ConnectorCredentials {
  token?: string;
  apiKey?: string;
  baseUrl?: string;
  username?: string;
  password?: string;
  [key: string]: string | undefined;
}

/**
 * Connector project/workspace identifier
 */
export interface ConnectorProject {
  owner?: string;
  repo?: string;
  path?: string;
  id?: string;
  key?: string;
  [key: string]: string | undefined;
}

/**
 * Input for creating a connector instance
 */
export interface CreateConnectorInput {
  tool: SupportedTool;
  credentials: ConnectorCredentials;
  project: ConnectorProject;
}

/**
 * Base connector interface - all connectors must implement this
 */
export interface IConnector {
  /**
   * Fetch data from the connector tool
   * Returns normalized output for persistence and risk scoring
   */
  getData(): Promise<ConnectorOutput>;
}
