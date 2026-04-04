/**
 * VCS Strategy Interface
 * Defines contract for all VCS provider implementations
 */

export interface IVcsStrategy {
  /**
   * Fetch data from the VCS provider
   * Return type is flexible and not fixed yet
   */
  getData(): Promise<unknown>;
}
