import { Router } from 'express';
import { healthRouter } from './health.route.js';
import { syncRouter } from './sync.route.js';
import { progressRouter } from './progress.route.js';
import { authRouter } from './auth.route.js';
import { projectRouter } from './project.route.js';

export const router = Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/sync', syncRouter);
router.use('/progress', progressRouter);
router.use('/projects', projectRouter);
