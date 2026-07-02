import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db/pool.js';
import activitiesRouter from './routes/activities.js';
import authRouter from './routes/auth.js';
import coachRouter from './routes/coach.js';
import coachLinkRouter from './routes/coachLink.js';
import exercisesRouter from './routes/exercises.js';
import habitsRouter from './routes/habits.js';
import injuriesRouter from './routes/injuries.js';
import logsRouter from './routes/logs.js';
import nutritionRouter from './routes/nutrition.js';
import plansRouter from './routes/plans.js';
import programsRouter from './routes/programs.js';
import settingsRouter from './routes/settings.js';
import trainingLogsRouter from './routes/trainingLogs.js';

export const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }));

// Slow down password-guessing: 20 login/register attempts per 15 minutes per IP.
// Off outside production so local dev and the test suite aren't throttled.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV !== 'production',
  message: { error: { message: 'Too many attempts. Please wait 15 minutes and try again.', code: 'RATE_LIMITED' } },
});
app.use('/api/auth', authLimiter);

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'disconnected', message: err.message });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/habits', habitsRouter);
app.use('/api/activities', activitiesRouter);
app.use('/api/coach', coachRouter);
app.use('/api/coach-link', coachLinkRouter);
app.use('/api/exercises', exercisesRouter);
app.use('/api/injuries', injuriesRouter);
app.use('/api/logs', logsRouter);
app.use('/api/nutrition', nutritionRouter);
app.use('/api/plans', plansRouter);
app.use('/api/programs', programsRouter);
app.use('/api/training-logs', trainingLogsRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: { message: 'Not found', code: 'NOT_FOUND' } });
});

if (process.env.NODE_ENV === 'production') {
  const webDist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  app.use(express.static(webDist, { index: false }));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
});
