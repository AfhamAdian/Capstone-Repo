import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { router } from './routes/index.js';
import { notFoundMiddleware } from './middlewares/not-found.middleware.js';
import { errorMiddleware } from './middlewares/error.middleware.js';
import { env } from './config/env.js';

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
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

app.listen(env.port, () => {
  console.log(`Server is running on port ${env.port} in ${env.nodeEnv} mode`);
});
