import { Router } from 'express';
import { healthCheck } from '../controllers/health.controller.js';

export const healthRouter = Router();

healthRouter.get('/', healthCheck);
