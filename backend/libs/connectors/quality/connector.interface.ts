/**
 * Code Quality Connector Interface
 * Defines contract for all code quality provider implementations
 */

export interface ICodeQualityConnector {
  /**
   * Fetch metrics data from the code quality provider
   * Return type is flexible based on provider
   */
  getData(): Promise<unknown>;
}
