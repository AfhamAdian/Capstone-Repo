import { Router } from 'express';
import {
  forgotPasswordHandler,
  getInviteHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  registerHandler,
  resetPasswordHandler,
  sendVerificationCodeHandler,
  verifyEmailCodeHandler,
} from '../controllers/auth.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

export const authRouter = Router();

authRouter.post('/send-verification-code', asyncHandler(sendVerificationCodeHandler));
authRouter.post('/verify-email-code', asyncHandler(verifyEmailCodeHandler));
authRouter.post('/register', asyncHandler(registerHandler));
authRouter.post('/login', asyncHandler(loginHandler));
authRouter.post('/logout', asyncHandler(logoutHandler));
authRouter.get('/me', requireAuth, asyncHandler(meHandler));
authRouter.post('/forgot-password', asyncHandler(forgotPasswordHandler));
authRouter.post('/reset-password', asyncHandler(resetPasswordHandler));
authRouter.get('/invite/:token', asyncHandler(getInviteHandler));
