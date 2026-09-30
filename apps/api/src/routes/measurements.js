import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { cleanDays, loadMeasurements } from '../lib/measurements.js';
import { resolveToday } from '../lib/userToday.js';
import { requireAuth } from '../middleware/auth.js';

// The signed-in person's own body measurements (waist, chest, arms, hips,
// thighs, neck), for the Progress charts. They are saved with the daily log
// (routes/logs.js); this only reads them. `?today=` is the device's day.

const router = Router();

router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const today = resolveToday(req.query.today);
  const days = cleanDays(req.query.days);
  res.json({ measurements: await loadMeasurements(req.userId, today, days) });
}));

export default router;
