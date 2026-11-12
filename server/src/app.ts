import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { type ErrorRequestHandler } from 'express';
import { config } from './config';
import { requireLogin, verifyCsrf } from './middleware/auth';
import { detectAutomatedVisitor, securityRateLimit, trackResponses } from './middleware/security';
import { adminRouter } from './routes/admin';
import { authRouter } from './routes/auth';
import { backupRouter } from './routes/backup';
import { publicRouter } from './routes/public';
import { queueRouter } from './routes/queue';
import { reportsRouter } from './routes/reports';
import { sectionsRouter } from './routes/sections';
import { transferRouter } from './routes/transfer';
import { sessionMiddleware } from './session';

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy ? 1 : false);

  app.use((_req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'same-origin' });
    next();
  });
  // 404s are recorded for every request, matched or not: that is where
  // scanner probing (/.env, /.git, ...) lands.
  app.use(trackResponses);

  const clientDir = path.resolve('client/dist');
  if (existsSync(clientDir)) {
    app.use(express.static(clientDir, { index: false, maxAge: '1h' }));
  }

  app.use(express.json({ limit: '100kb' }));
  app.use(sessionMiddleware());
  // Security layers run after the session so events can be attributed, and
  // rate limiting runs before bot detection so floods are shed cheaply.
  app.use(securityRateLimit);
  app.use(detectAutomatedVisitor);

  const api = express.Router();
  api.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  api.use(verifyCsrf);
  api.use(authRouter);
  api.use(publicRouter);
  // Everything below requires a signed-in, single-device session.
  api.use(requireLogin);
  api.use(queueRouter);
  api.use(transferRouter);
  api.use(sectionsRouter);
  api.use(adminRouter);
  api.use(reportsRouter);
  api.use(backupRouter);
  api.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Not found' });
  });
  app.use('/api', api);

  // Single-page app: every other GET that is not a file gets index.html.
  app.get(/^(?!\/api\/|\/socket\.io\/).*/, (req, res, next) => {
    const index = path.join(clientDir, 'index.html');
    // Dotfile probes (/.env, /.git/...) must read as 404s, not as the app.
    if (path.extname(req.path) !== '' || /(^|\/)\./.test(req.path) || !existsSync(index)) {
      next();
      return;
    }
    res.set('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
  app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Not found' });
  });

  const onError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (res.headersSent) {
      console.error(error);
      return;
    }
    // Client mistakes (oversized or malformed bodies) are answered, not logged as server errors.
    if (error?.type === 'entity.too.large') {
      res.status(413).json({ success: false, message: 'That request is too large.' });
      return;
    }
    if (error?.type === 'entity.parse.failed') {
      res.status(400).json({ success: false, message: 'The request could not be read.' });
      return;
    }
    console.error(error);
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  };
  app.use(onError);

  return app;
}
