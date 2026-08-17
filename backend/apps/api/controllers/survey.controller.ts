/**
 * Survey Controller (admin-facing)
 */

import type { Request, Response } from 'express';
import { createAiClient, type GeneratedSurveyQuestion } from '@libs/ai/index.js';
import { SurveyQueueManager } from '@libs/queue/index.js';
import {
  SurveyService,
  ForbiddenError,
  SurveyNotFoundError,
  SurveyLockedError,
  SurveyValidationError,
  type SurveyLifecycleAction,
} from '../services/survey.service.js';
import { assertProjectAccess } from '../services/authorization.service.js';
import { getRequesterRole, isLevel1 } from '../utils/requester-role.js';
import { getSurveyById, type SurveyStatus } from '../database/survey.js';
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
    if (error instanceof SurveyValidationError) {
      response.status(400).json({ message: error.message });
      return;
    }
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

  const { trigger, customGuidance, questions, targetCount } = request.body as {
    trigger?: string;
    customGuidance?: string;
    questions?: unknown;
    targetCount?: number;
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
      targetCount: typeof targetCount === 'number' ? targetCount : undefined,
    });
    response.status(202).json({ message: 'Survey queued for sending', surveyId: result.surveyId });
  } catch (error) {
    if (error instanceof SurveyValidationError) {
      response.status(400).json({ message: error.message });
      return;
    }
    if (error instanceof ForbiddenError) {
      response.status(403).json({ message: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : 'Failed to send survey';
    const status = message.includes('Monthly manual survey limit') ? 429 : 500;
    response.status(status).json({ message });
  }
}

/** POST /api/v1/projects/:projectId/surveys/send-now */
export async function sendSurveyNow(request: Request, response: Response): Promise<void> {
  const projectId = parseProjectId(request, response);
  if (projectId === null) return;

  const { trigger, customGuidance } = (request.body ?? {}) as { trigger?: string; customGuidance?: string };

  try {
    await assertProjectAccess(projectId, request);
    const result = await surveyService.sendNow(projectId, { trigger, customGuidance });
    response.status(200).json(result);
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
    await assertProjectAccess(projectId, request);
    const surveys = await surveyService.listForProject(projectId);
    response.status(200).json({ surveys });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      response.status(403).json({ message: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : 'Failed to list surveys';
    response.status(500).json({ message });
  }
}

/** GET /api/v1/surveys?projectId=&status=&q= */
export async function listGlobalSurveys(request: Request, response: Response): Promise<void> {
  try {
    if (!isLevel1(getRequesterRole(request))) {
      response.status(403).json({ message: 'Level-1 access is required to list organization surveys' });
      return;
    }
    const { projectId, status, q } = request.query as { projectId?: string; status?: string; q?: string };
    const surveys = await surveyService.listGlobal({
      projectId: projectId ? Number(projectId) : undefined,
      status: status as SurveyStatus | undefined,
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
    const survey = await getSurveyById(surveyId);
    if (!survey) {
      response.status(404).json({ message: 'Survey not found' });
      return;
    }
    await assertProjectAccess(survey.project_id, request);
    const detail = await surveyService.getDetail(surveyId);
    if (!detail) {
      response.status(404).json({ message: 'Survey not found' });
      return;
    }
    response.status(200).json(detail);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      response.status(403).json({ message: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : 'Failed to load survey';
    response.status(500).json({ message });
  }
}

/**
 * PATCH /api/v1/surveys/:surveyId/questions
 * Level-1 (CEO/CTO) question editing. Blocked once the survey has been sent.
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
    if (error instanceof SurveyValidationError) {
      response.status(400).json({ message: error.message });
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
    response.status(200).json({ message: 'Survey closed; scoring queued' });
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
    const message = error instanceof Error ? error.message : 'Failed to complete survey';
    response.status(500).json({ message });
  }
}

/** POST /api/v1/surveys/:surveyId/close — stop the public form and queue AI scoring */
export async function closeSurveyForm(request: Request, response: Response): Promise<void> {
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
    if (!['active', 'closed', 'failed'].includes(survey.status)) {
      response.status(409).json({ message: 'Only an active, closed, or failed survey can be scored' });
      return;
    }

    await surveyService.completeSurvey(surveyId);
    response.status(200).json({ message: 'Survey form closed; scoring queued' });
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
    const message = error instanceof Error ? error.message : 'Failed to close survey form';
    response.status(500).json({ message });
  }
}

/** POST /api/v1/surveys/:surveyId/remind — anonymous channel reminder that the form is still open */
export async function remindSurveyForm(request: Request, response: Response): Promise<void> {
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
    const result = await surveyService.remindActiveSurvey(surveyId);
    response.status(200).json({ message: 'Reminder posted to team channels', ...result });
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
    const message = error instanceof Error ? error.message : 'Failed to send reminder';
    response.status(500).json({ message });
  }
}

/** PATCH /api/v1/surveys/:surveyId/lifecycle */
export async function changeSurveyLifecycle(request: Request, response: Response): Promise<void> {
  const surveyId = Number(request.params.surveyId);
  const action = (request.body as { action?: SurveyLifecycleAction }).action;
  if (!Number.isInteger(surveyId) || surveyId <= 0) {
    response.status(400).json({ message: 'surveyId must be a positive number' });
    return;
  }
  if (!action || !['pause', 'resume', 'retry', 'cancel', 'close'].includes(action)) {
    response.status(400).json({ message: 'action must be pause, resume, retry, cancel, or close' });
    return;
  }

  try {
    const survey = await getSurveyById(surveyId);
    if (!survey) {
      response.status(404).json({ message: `Survey ${surveyId} not found` });
      return;
    }
    await assertProjectAccess(survey.project_id, request);
    await surveyService.changeLifecycle(surveyId, action);
    response.status(200).json({ message: `Survey ${action} applied` });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      response.status(403).json({ message: error.message });
      return;
    }
    if (error instanceof SurveyLockedError) {
      response.status(409).json({ message: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : 'Failed to update survey lifecycle';
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
 * Admin visibility into this month's auto-pulse for this project.
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
