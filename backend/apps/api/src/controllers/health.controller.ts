import type { Request, Response } from 'express';
import { getHealthStatus } from '../services/health.service.js';
import { asyncHandler } from '../utils/async-handler.js';

export const healthCheck = asyncHandler(async (_request: Request, response: Response) => {
  response.status(200).json(await getHealthStatus());
});
