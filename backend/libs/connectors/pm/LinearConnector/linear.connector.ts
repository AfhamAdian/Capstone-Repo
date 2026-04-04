/**
 * Linear PM Connector Implementation (Placeholder)
 */

import { IPmConnector } from '../connector.interface.js';
import { CreatePmConnectorInput } from '../types.js';

export class LinearConnector implements IPmConnector {
  private credentials: { token: string };
  private project: { projectId?: string };

  constructor(input: CreatePmConnectorInput) {
    if (!input.credentials.token) {
      throw new Error('Linear token is required');
    }

    this.credentials = { token: input.credentials.token };
    this.project = {
      projectId: input.project.projectId,
    };
  }

  async getData(): Promise<unknown> {
    // Implementation to be added
    throw new Error('getData() not yet implemented for Linear');
  }
}
