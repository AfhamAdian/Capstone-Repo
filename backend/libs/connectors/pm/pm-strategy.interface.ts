/**
 * PM Strategy Interface
 * Defines contract for all PM provider implementations
 */

export interface IPmStrategy {
  /**
   * Fetch metrics data from the PM provider
   * Return type is flexible based on provider
   */
  getData(): Promise<unknown>;
}
