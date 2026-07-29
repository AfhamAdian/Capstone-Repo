/**
 * Survey Controller (admin-facing)
 */

import type { Request, Response } from 'express';
import { createAiClient, type GeneratedSurveyQuestion } from '@libs/ai/index.js';
import { SurveyQueueManager } from '@libs/queue/index.js';
import { SurveyService, ForbiddenError, SurveyNotFoundError, SurveyLockedError } from '../services/survey.service.js';
import { assertProjectAccess } from '../services/authorization.service.js';
import { getRequesterRole } from '../utils/requester-role.js';
import { getSurveyById } from '../database/survey.js';
import { env } from '../config/env.js';

if (!env.redisUrl) {
  throw new Error('REDIS_URL is required to enqueue survey jobs');
}

const surveyQueueManager = new SurveyQueueManager({ redisUrl: env.redisUrl });
const aiClient = createAiClient(env.geminiApiKey, env.geminiModel);
const surveyService = new SurveyService({ aiClient, surveyQueueManager });

function parseProjectId(request: Request, response: Response): number | null {
  const projectId = Number(request.params.projectId);
  if (!Number.isFinite(projectId) || projectId <= 0) {
    response.status(400).json({ message: 'projectId must be a positive number' });
    return null;
  }
  return projectId;
}

/** POST /api/v1/projects/:projectId/surveys/generate-questions */
export async function generateSurveyQuestions(request: Request, response: Response): Promise<void> {
  const projectId = parseProjectId(request, response);
  if (projectId === null) return;

  const { trigger, customGuidance } = request.body as { trigger?: string; customGuidance?: string };
  if (!trigger) {
    response.status(400).json({ message: 'trigger is required' });
    return;
  }

  try {
    await assertProjectAccess(projectId, request);
    const questions = await surveyService.generateQuestions(projectId, trigger, customGuidance);
    response.status(200).json({ questions });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      response.status(403).json({ message: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : 'Failed to generate survey questions';
    response.status(500).json({ message });
  }
}

/** POST /api/v1/projects/:projectId/surveys */
export async function sendSurvey(request: Request, response: Response): Promise<void> {
  const projectId = parseProjectId(request, response);
  if (projectId === null) return;

  const { trigger, customGuidance, questions } = request.body as {
    trigger?: string;
    customGuidance?: string;
    questions?: unknown;
  };
  if (!trigger) {
    response.status(400).json({ message: 'trigger is required' });
    return;
  }
  if (!Array.isArray(questions) || questions.length === 0) {
    response.status(400).json({ message: 'questions must be a non-empty array (call generate-questions first)' });
    return;
  }

  try {
    await assertProjectAccess(projectId, request);
    const result = await surveyService.createAndSendSurvey(projectId, {
      trigger,
      customGuidance,
      questions: questions as GeneratedSurveyQuestion[],
    });
    response.status(202).json({ message: 'Survey queued for sending', surveyId: result.surveyId });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      response.status(403).json({ message: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : 'Failed to send survey';
    const status = message.includes('Monthly manual survey limit') ? 429 : 500;
    response.status(status).json({ message });
  }
}

/** GET /api/v1/projects/:projectId/surveys */
export async function listProjectSurveys(request: Request, response: Response): Promise<void> {
  const projectId = parseProjectId(request, response);
  if (projectId === null) return;

  try {
    const surveys = await surveyService.listForProject(projectId);
    response.status(200).json({ surveys });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list surveys';
    response.status(500).json({ message });
  }
}

/** GET /api/v1/surveys?projectId=&status=&q= */
export async function listGlobalSurveys(request: Request, response: Response): Promise<void> {
  try {
    const { projectId, status, q } = request.query as { projectId?: string; status?: string; q?: string };
    const surveys = await surveyService.listGlobal({
      projectId: projectId ? Number(projectId) : undefined,
      status: status as 'active' | 'sent' | 'completed' | undefined,
      search: q,
    });
    response.status(200).json({ surveys });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list surveys';
    response.status(500).json({ message });
  }
}

/** GET /api/v1/surveys/:surveyId */
export async function getSurveyDetail(request: Request, response: Response): Promise<void> {
  const surveyId = Number(request.params.surveyId);
  if (!Number.isFinite(surveyId) || surveyId <= 0) {
    response.status(400).json({ message: 'surveyId must be a positive number' });
    return;
  }

  try {
    const detail = await surveyService.getDetail(surveyId);
    if (!detail) {
      response.status(404).json({ message: 'Survey not found' });
      return;
    }
    response.status(200).json(detail);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load survey';
    response.status(500).json({ message });
  }
}

/**
 * PATCH /api/v1/surveys/:surveyId/questions
 * Level-1 (CEO/CTO) question editing - no approval workflow, this endpoint IS
 * the review step. Works before or after the survey has been sent; blocked
 * once any response has been submitted. Editing after first send sets a
 * "modified" tag rather than being rejected.
 */
export async function updateSurveyQuestions(request: Request, response: Response): Promise<void> {
  const surveyId = Number(request.params.surveyId);
  if (!Number.isFinite(surveyId) || surveyId <= 0) {
    response.status(400).json({ message: 'surveyId must be a positive number' });
    return;
  }

  const { questions } = request.body as { questions?: unknown };
  if (!Array.isArray(questions) || questions.length === 0) {
    response.status(400).json({ message: 'questions must be a non-empty array' });
    return;
  }

  try {
    const survey = await getSurveyById(surveyId);
    if (!survey) {
      response.status(404).json({ message: `Survey ${surveyId} not found` });
      return;
    }
    await assertProjectAccess(survey.project_id, request);

    const requesterRole = getRequesterRole(request);
    await surveyService.editQuestions(surveyId, questions as GeneratedSurveyQuestion[], requesterRole);
    response.status(200).json({ message: 'Survey questions updated' });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      response.status(403).json({ message: error.message });
      return;
    }
    if (error instanceof SurveyNotFoundError) {
      response.status(404).json({ message: error.message });
      return;
    }
    if (error instanceof SurveyLockedError) {
      response.status(409).json({ message: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : 'Failed to update survey questions';
    response.status(500).json({ message });
  }
}

/** PATCH /api/v1/surveys/:surveyId/complete */
export async function completeSurvey(request: Request, response: Response): Promise<void> {
  const surveyId = Number(request.params.surveyId);
  if (!Number.isFinite(surveyId) || surveyId <= 0) {
    response.status(400).json({ message: 'surveyId must be a positive number' });
    return;
  }

  try {
    const survey = await getSurveyById(surveyId);
    if (!survey) {
      response.status(404).json({ message: `Survey ${surveyId} not found` });
      return;
    }
    await assertProjectAccess(survey.project_id, request);

    await surveyService.completeSurvey(surveyId);
    response.status(200).json({ message: 'Survey marked complete, analysis queued' });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      response.status(403).json({ message: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : 'Failed to complete survey';
    response.status(500).json({ message });
  }
}

/** GET /api/v1/projects/:projectId/surveys/quota */
export async function getSurveyQuota(request: Request, response: Response): Promise<void> {
  const projectId = parseProjectId(request, response);
  if (projectId === null) return;

  try {
    const quota = await surveyService.getQuota(projectId);
    response.status(200).json(quota);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load survey quota';
    response.status(500).json({ message });
  }
}

/**
 * GET /api/v1/projects/:projectId/surveys/schedule
 * Admin visibility into this month's staggered auto-pulse rounds for this
 * project - otherwise `surveyschedule` is invisible worker-internal state.
 */
export async function getSurveySchedule(request: Request, response: Response): Promise<void> {
  const projectId = parseProjectId(request, response);
  if (projectId === null) return;

  try {
    const schedule = await surveyService.getSchedule(projectId);
    response.status(200).json({ schedule });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load survey schedule';
    response.status(500).json({ message });
  }
}

/** GET /api/v1/projects/:projectId/pending-survey */
export async function getPendingSurvey(request: Request, response: Response): Promise<void> {
  const projectId = parseProjectId(request, response);
  if (projectId === null) return;

  try {
    const pending = await surveyService.getPendingSurvey(projectId);
    response.status(200).json(pending);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load pending survey status';
    response.status(500).json({ message });
  }
}
