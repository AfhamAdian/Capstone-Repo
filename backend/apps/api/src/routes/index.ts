import { Router } from 'express';
import { healthRouter } from './health.route.js';

export const router = Router();

router.use('/health', healthRouter);
