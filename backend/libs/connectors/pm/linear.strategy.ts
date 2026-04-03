/**
 * Linear PM Strategy Implementation (Placeholder)
 */

import { IPmStrategy } from './pm-strategy.interface.js';
import { CreatePmStrategyInput } from './types.js';

export class LinearStrategy implements IPmStrategy {
  private credentials: { token: string };
  private project: { projectId?: string };

  constructor(input: CreatePmStrategyInput) {
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
