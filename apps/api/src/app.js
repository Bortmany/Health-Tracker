import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { pool } from './db/pool.js';
import activitiesRouter from './routes/activities.js';
import authRouter from './routes/auth.js';
import habitsRouter from './routes/habits.js';
import injuriesRouter from './routes/injuries.js';
import logsRouter from './routes/logs.js';
import settingsRouter from './routes/settings.js';

export const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }));

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
app.use('/api/injuries', injuriesRouter);
app.use('/api/logs', logsRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
});
