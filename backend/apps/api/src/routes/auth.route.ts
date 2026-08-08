import { Router } from 'express';
import {
  loginHandler,
  logoutHandler,
  meHandler,
  registerHandler,
} from '../controllers/auth.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

export const authRouter = Router();

authRouter.post('/register', asyncHandler(registerHandler));
authRouter.post('/login', asyncHandler(loginHandler));
authRouter.post('/logout', asyncHandler(logoutHandler));
authRouter.get('/me', requireAuth, asyncHandler(meHandler));
