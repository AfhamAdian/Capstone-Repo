/**
 * VCS Connector Interface
 * Defines contract for all VCS provider implementations
 */

export interface IVcsConnector {
  /**
   * Fetch data from the VCS provider
   * Return type is flexible and not fixed yet
   */
  getData(): Promise<unknown>;
}
