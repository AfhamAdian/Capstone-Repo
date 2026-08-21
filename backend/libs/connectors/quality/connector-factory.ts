/**
 * Code Quality Connector Factory
 * Creates the appropriate connector based on provider
 */

import { CreateCodeQualityConnectorInput, CodeQualityProvider } from './types.js';
import { ICodeQualityConnector } from './connector.interface.js';
import { SonarQubeConnector } from './SonarQubeConnector/sonarqube.connector.js';

export function createCodeQualityConnector(
  input: CreateCodeQualityConnectorInput,
): ICodeQualityConnector {
  const provider = input.provider as CodeQualityProvider;

  switch (provider) {
    case 'sonarqube':
      return new SonarQubeConnector(input);
    default:
      throw new Error(`Unsupported code quality provider: ${provider}`);
  }
}
