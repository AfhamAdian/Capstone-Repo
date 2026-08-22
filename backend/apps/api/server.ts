import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import { router } from './routes/index.js';
import { notFoundMiddleware } from './middlewares/not-found.middleware.js';
import { errorMiddleware } from './middlewares/error.middleware.js';
import { env } from './config/env.js';

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({
    origin: env.frontendOrigin,
    credentials: true,
    exposedHeaders: ['x-action-search-mode'],
  }));
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan('dev'));

  app.get('/api/v1', (_request, response) => {
    response.json({
      message: 'API is running',
    });
  });

  app.use('/api/v1', router);
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`Server is running on port ${env.port} in ${env.nodeEnv} mode`);
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `Port ${env.port} is already in use. This API needs that port.\n` +
        `The worker uses WORKER_PORT (4000) and is not the cause.\n` +
        `Find what is bound:  ss -tlnp | grep ${env.port}   or   docker ps\n` +
        `Free it, then run npm run dev again.`,
    );
    process.exit(1);
  }
  throw error;
});
