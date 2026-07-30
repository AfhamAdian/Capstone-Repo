/**
 * PM Connector Factory
 * Creates the appropriate connector based on provider
 */

import { CreatePmConnectorInput, PmProvider } from './types.js';
import { IPmConnector } from './connector.interface.js';
import { JiraConnector } from './JiraConnector/jira.connector.js';
import { LinearConnector } from './LinearConnector/linear.connector.js';

export function createPmConnector(input: CreatePmConnectorInput): IPmConnector {
  const provider = input.provider as PmProvider;

  switch (provider) {
    case 'jira':
      return new JiraConnector(input);
    case 'linear':
      return new LinearConnector(input);
    default:
      throw new Error(`Unsupported PM provider: ${provider}`);
  }
}
