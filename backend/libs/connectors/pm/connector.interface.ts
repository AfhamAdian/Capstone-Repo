/**
 * PM Connector Interface
 * Defines contract for all PM provider implementations
 */

export interface IPmConnector {
  /**
   * Fetch metrics data from the PM provider
   * Return type is flexible based on provider
   */
  getData(): Promise<unknown>;
}
