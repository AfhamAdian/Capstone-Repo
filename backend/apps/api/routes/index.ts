import { Router } from 'express';
import { healthRouter } from './health.route.js';
import { syncRouter } from './sync.route.js';
import { progressRouter } from './progress.route.js';
import { projectRouter } from './project.route.js';
import { surveyRouter } from './survey.route.js';
import { projectSurveyRouter } from './project-survey.route.js';
import { surveyPublicRouter } from './survey-public.route.js';

export const router = Router();

router.use('/health', healthRouter);
router.use('/sync', syncRouter);
router.use('/progress', progressRouter);
router.use('/surveys', surveyRouter);
router.use('/projects', projectRouter);
router.use('/projects/:projectId', projectSurveyRouter);
router.use('/public/surveys', surveyPublicRouter);
