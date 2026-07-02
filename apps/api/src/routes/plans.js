import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { rankTemplates, weekTargets } from '../lib/planGenerator.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toPublicTemplate(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    goal: row.goal,
    experience: row.experience,
    equipment: row.equipment,
    daysPerWeek: row.days_per_week,
  };
}

async function fetchTemplateDays(templateId) {
  const { rows: dayRows } = await pool.query(
    'SELECT * FROM plan_template_days WHERE plan_template_id = $1 ORDER BY sort_order',
    [templateId]
  );
  const { rows: exerciseRows } = await pool.query(
    `SELECT e.* FROM plan_template_exercises e
     JOIN plan_template_days d ON d.id = e.plan_template_day_id
     WHERE d.plan_template_id = $1
     ORDER BY e.sort_order`,
    [templateId]
  );
  return dayRows.map((day) => ({
    id: day.id,
    name: day.name,
    exercises: exerciseRows
      .filter((e) => e.plan_template_day_id === day.id)
      .map((e) => ({ name: e.name, targetSets: e.target_sets, targetReps: e.target_reps })),
  }));
}

async function fetchQuizAnswers(userId) {
  const { rows } = await pool.query('SELECT * FROM user_settings WHERE user_id = $1', [userId]);
  const s = rows[0] ?? {};
  return {
    age: s.age,
    experienceLevel: s.experience_level,
    trainingGoal: s.training_goal,
    equipment: s.equipment,
    daysPerWeek: s.days_per_week,
  };
}

router.use(requireAuth);

router.get('/templates', asyncHandler(async (req, res) => {
  const filters = [];
  const params = [];
  for (const key of ['goal', 'experience', 'equipment']) {
    if (req.query[key]) {
      params.push(req.query[key]);
      filters.push(`${key} = $${params.length}`);
    }
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const { rows } = await pool.query(`SELECT * FROM plan_templates ${where} ORDER BY name`, params);
  res.json({ templates: rows.map(toPublicTemplate) });
}));

router.get('/templates/recommended', asyncHandler(async (req, res) => {
  const answers = await fetchQuizAnswers(req.userId);
  const { rows } = await pool.query('SELECT * FROM plan_templates');
  const ranked = rankTemplates(rows, answers).slice(0, 3);
  res.json({ templates: ranked.map((r) => toPublicTemplate(r.template)) });
}));

router.get('/templates/:id', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM plan_templates WHERE id = $1', [req.params.id]);
  if (!rows[0]) {
    return res.status(404).json({ error: { message: 'Plan not found', code: 'NOT_FOUND' } });
  }
  const days = await fetchTemplateDays(rows[0].id);
  res.json({ template: { ...toPublicTemplate(rows[0]), days } });
}));

router.post('/templates/:id/adopt', asyncHandler(async (req, res) => {
  const { rows: templateRows } = await pool.query('SELECT * FROM plan_templates WHERE id = $1', [
    req.params.id,
  ]);
  const template = templateRows[0];
  if (!template) {
    return res.status(404).json({ error: { message: 'Plan not found', code: 'NOT_FOUND' } });
  }

  const { rows: userRows } = await pool.query('SELECT plan_tier FROM users WHERE id = $1', [req.userId]);
  const tier = userRows[0].plan_tier;

  const requestedWeeks = req.body?.durationWeeks ?? (tier === 'premium' ? 52 : 4);
  if (requestedWeeks > 4 && tier !== 'premium') {
    return res.status(402).json({
      error: {
        message: 'The full-year plan is part of Premium. Your free plan covers the first 4 weeks.',
        code: 'PREMIUM_REQUIRED',
      },
    });
  }
  const durationWeeks = requestedWeeks > 4 ? 52 : 4;

  const startDate = DATE_RE.test(req.body?.startDate ?? '')
    ? req.body.startDate
    : new Date().toISOString().slice(0, 10);

  const days = await fetchTemplateDays(template.id);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: programRows } = await client.query(
      'INSERT INTO programs (user_id, name, description) VALUES ($1, $2, $3) RETURNING id',
      [req.userId, template.name, template.description]
    );
    const programId = programRows[0].id;

    for (const [dayIndex, day] of days.entries()) {
      const { rows: dayRows } = await client.query(
        'INSERT INTO program_days (program_id, name, sort_order) VALUES ($1, $2, $3) RETURNING id',
        [programId, day.name, dayIndex]
      );
      for (const [exIndex, ex] of day.exercises.entries()) {
        await client.query(
          `INSERT INTO program_exercises (program_day_id, name, target_sets, target_reps, sort_order)
           VALUES ($1, $2, $3, $4, $5)`,
          [dayRows[0].id, ex.name, ex.targetSets, ex.targetReps, exIndex]
        );
      }
    }

    // Starting a new plan replaces the current one (the old program stays).
    await client.query('DELETE FROM user_plans WHERE user_id = $1', [req.userId]);
    await client.query(
      `INSERT INTO user_plans (user_id, plan_template_id, program_id, start_date, duration_weeks)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.userId, template.id, programId, startDate, durationWeeks]
    );

    await client.query('COMMIT');
    res.status(201).json({ programId, durationWeeks, startDate });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

router.get('/my-plan', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT up.*, t.name, t.description, t.progression, t.phases
     FROM user_plans up
     LEFT JOIN plan_templates t ON t.id = up.plan_template_id
     WHERE up.user_id = $1`,
    [req.userId]
  );
  const plan = rows[0];
  if (!plan) return res.json({ plan: null });

  // Compare calendar dates, not clock times, so week boundaries don't
  // drift by a day depending on what time of day someone opens the app.
  const startDate = plan.start_date.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const daysSinceStart = Math.round((Date.parse(today) - Date.parse(startDate)) / (1000 * 60 * 60 * 24));
  const rawWeek = Math.floor(Math.max(daysSinceStart, 0) / 7) + 1;
  const completed = rawWeek > plan.duration_weeks;
  const weekNumber = Math.min(rawWeek, plan.duration_weeks);

  const targets = weekTargets(
    { progression: plan.progression ?? {}, phases: plan.phases ?? [] },
    weekNumber,
    plan.duration_weeks
  );

  res.json({
    plan: {
      name: plan.name,
      description: plan.description,
      programId: plan.program_id,
      startDate,
      durationWeeks: plan.duration_weeks,
      completed,
      ...targets,
    },
  });
}));

router.delete('/my-plan', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM user_plans WHERE user_id = $1', [req.userId]);
  res.status(204).end();
}));

export default router;
