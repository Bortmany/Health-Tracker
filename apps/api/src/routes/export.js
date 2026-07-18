import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { fetchNestedDays } from './programs.js';

const router = Router();

// GET /api/export — everything the signed-in user has stored, as one JSON
// document they can download and keep. This is the "give me a copy of my
// data" right that privacy law expects for health data. The password hash is
// never included; every query is scoped to the signed-in user.

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const list = map.get(row[key]) ?? [];
    list.push(row);
    map.set(row[key], list);
  }
  return map;
}

router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  // Profile — the same public fields the app shows, never the password hash.
  const { rows: userRows } = await pool.query(
    'SELECT id, email, display_name, plan_tier, role, created_at FROM users WHERE id = $1',
    [req.userId]
  );
  const user = userRows[0];
  if (!user) {
    return res.status(401).json({ error: { message: 'Not authenticated', code: 'NO_TOKEN' } });
  }

  const { rows: settingsRows } = await pool.query('SELECT * FROM user_settings WHERE user_id = $1', [req.userId]);
  const s = settingsRows[0];

  const { rows: habitRows } = await pool.query(
    'SELECT * FROM habits WHERE user_id = $1 ORDER BY sort_order, label',
    [req.userId]
  );
  const { rows: activityRows } = await pool.query(
    'SELECT * FROM activities WHERE user_id = $1 ORDER BY name',
    [req.userId]
  );
  const { rows: injuryRows } = await pool.query(
    'SELECT * FROM injuries WHERE user_id = $1 ORDER BY created_at',
    [req.userId]
  );

  // Daily logs with their habit ticks, activities, and injury check-ins.
  // date::text keeps calendar dates as plain strings (no timezone shifts).
  const { rows: dailyLogRows } = await pool.query(
    'SELECT *, date::text AS date FROM daily_logs WHERE user_id = $1 ORDER BY daily_logs.date',
    [req.userId]
  );
  const { rows: logHabitRows } = await pool.query(
    `SELECT dlh.daily_log_id, h.label, dlh.completed
     FROM daily_log_habits dlh
     JOIN daily_logs dl ON dl.id = dlh.daily_log_id
     JOIN habits h ON h.id = dlh.habit_id
     WHERE dl.user_id = $1`,
    [req.userId]
  );
  const { rows: logActivityRows } = await pool.query(
    `SELECT dla.daily_log_id, COALESCE(dla.name, a.name) AS name, dla.duration_minutes
     FROM daily_log_activities dla
     JOIN daily_logs dl ON dl.id = dla.daily_log_id
     LEFT JOIN activities a ON a.id = dla.activity_id
     WHERE dl.user_id = $1`,
    [req.userId]
  );
  const { rows: checkinRows } = await pool.query(
    `SELECT c.daily_log_id, i.region, c.pain_pre, c.pain_during, c.pain_post, c.swelling, c.can_train_tomorrow
     FROM daily_log_injury_checkins c
     JOIN daily_logs dl ON dl.id = c.daily_log_id
     JOIN injuries i ON i.id = c.injury_id
     WHERE dl.user_id = $1`,
    [req.userId]
  );
  const habitsByLog = groupBy(logHabitRows, 'daily_log_id');
  const activitiesByLog = groupBy(logActivityRows, 'daily_log_id');
  const checkinsByLog = groupBy(checkinRows, 'daily_log_id');

  // Nutrition days with their meals.
  const { rows: nutritionRows } = await pool.query(
    'SELECT *, date::text AS date FROM nutrition_logs WHERE user_id = $1 ORDER BY nutrition_logs.date',
    [req.userId]
  );
  const { rows: mealRows } = await pool.query(
    `SELECT m.* FROM nutrition_log_meals m
     JOIN nutrition_logs nl ON nl.id = m.nutrition_log_id
     WHERE nl.user_id = $1
     ORDER BY m.sort_order`,
    [req.userId]
  );
  const mealsByLog = groupBy(mealRows, 'nutrition_log_id');

  // Programs with their days and exercises (same nested shape the app uses).
  const { rows: programRows } = await pool.query(
    'SELECT * FROM programs WHERE user_id = $1 ORDER BY created_at',
    [req.userId]
  );
  const programs = await Promise.all(
    programRows.map(async (row) => ({
      name: row.name,
      description: row.description,
      createdAt: row.created_at,
      archivedAt: row.archived_at,
      fromCoach: row.created_by_coach_id != null,
      days: await fetchNestedDays(pool, row.id),
    }))
  );

  // Training sessions with their exercises and sets.
  const { rows: trainingRows } = await pool.query(
    'SELECT *, date::text AS date FROM training_logs WHERE user_id = $1 ORDER BY training_logs.date, created_at',
    [req.userId]
  );
  const { rows: trainingExerciseRows } = await pool.query(
    `SELECT te.* FROM training_log_exercises te
     JOIN training_logs tl ON tl.id = te.training_log_id
     WHERE tl.user_id = $1
     ORDER BY te.sort_order`,
    [req.userId]
  );
  const { rows: setRows } = await pool.query(
    `SELECT ts.* FROM training_log_sets ts
     JOIN training_log_exercises te ON te.id = ts.training_log_exercise_id
     JOIN training_logs tl ON tl.id = te.training_log_id
     WHERE tl.user_id = $1
     ORDER BY ts.set_number`,
    [req.userId]
  );
  const exercisesByLog = groupBy(trainingExerciseRows, 'training_log_id');
  const setsByExercise = groupBy(setRows, 'training_log_exercise_id');

  // Personal records: each exercise's single best (heaviest) logged set —
  // the same list the Train page shows.
  const { rows: recordRows } = await pool.query(
    `SELECT * FROM (
       SELECT DISTINCT ON (te.name)
         te.name, s.weight, s.reps, tl.date::text AS date
       FROM training_log_sets s
       JOIN training_log_exercises te ON te.id = s.training_log_exercise_id
       JOIN training_logs tl ON tl.id = te.training_log_id
       WHERE tl.user_id = $1 AND s.weight IS NOT NULL
       ORDER BY te.name, s.weight DESC
     ) best
     ORDER BY weight DESC
     LIMIT 20`,
    [req.userId]
  );

  // Current adopted plan, if any.
  const { rows: planRows } = await pool.query(
    `SELECT up.start_date::text AS start_date, up.duration_weeks, t.name
     FROM user_plans up
     LEFT JOIN plan_templates t ON t.id = up.plan_template_id
     WHERE up.user_id = $1`,
    [req.userId]
  );
  const plan = planRows[0];

  // Current logging streak, computed the same way as GET /logs/streak.
  const { rows: streakRows } = await pool.query(
    'SELECT date::text AS date FROM daily_logs WHERE user_id = $1 ORDER BY date DESC LIMIT 400',
    [req.userId]
  );
  const dates = new Set(streakRows.map((r) => r.date));
  const cursor = new Date();
  let streak = 0;
  if (!dates.has(cursor.toISOString().slice(0, 10))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  // The coach connected to this account, if any.
  const { rows: coachRows } = await pool.query(
    `SELECT u.display_name FROM coach_clients cc
     JOIN users u ON u.id = cc.coach_id
     WHERE cc.client_id = $1 AND cc.status = 'active'
     LIMIT 1`,
    [req.userId]
  );

  // Offering the file for download keeps the raw JSON out of the browser tab
  // when someone opens the address directly.
  res.setHeader('Content-Disposition', 'attachment; filename="cut-data-export.json"');
  res.json({
    exportedAt: new Date().toISOString(),
    profile: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      planTier: user.plan_tier,
      role: user.role,
      createdAt: user.created_at,
    },
    settings: s
      ? {
          startWeight: s.start_weight,
          targetWeight: s.target_weight,
          targetDate: s.target_date,
          height: s.height,
          age: s.age,
          stepGoal: s.step_goal,
          sleepGoal: s.sleep_goal,
          experienceLevel: s.experience_level,
          trainingGoal: s.training_goal,
          equipment: s.equipment,
          daysPerWeek: s.days_per_week,
        }
      : null,
    habits: habitRows.map((row) => ({
      label: row.label,
      description: row.description,
      archivedAt: row.archived_at,
    })),
    activities: activityRows.map((row) => ({
      name: row.name,
      category: row.category,
      defaultDurationMinutes: row.default_duration_minutes,
    })),
    injuries: injuryRows.map((row) => ({
      region: row.region,
      note: row.note,
      createdAt: row.created_at,
      archivedAt: row.archived_at,
    })),
    dailyLogs: dailyLogRows.map((row) => ({
      date: row.date,
      weight: row.weight,
      waist: row.waist,
      sleep: row.sleep,
      hrv: row.hrv,
      recovery: row.recovery,
      strain: row.strain,
      steps: row.steps,
      calories: row.calories,
      notes: row.notes,
      habits: (habitsByLog.get(row.id) ?? []).map((h) => ({ label: h.label, completed: h.completed })),
      activities: (activitiesByLog.get(row.id) ?? []).map((a) => ({
        name: a.name,
        durationMinutes: a.duration_minutes,
      })),
      injuryCheckins: (checkinsByLog.get(row.id) ?? []).map((c) => ({
        region: c.region,
        painPre: c.pain_pre,
        painDuring: c.pain_during,
        painPost: c.pain_post,
        swelling: c.swelling,
        canTrainTomorrow: c.can_train_tomorrow,
      })),
    })),
    nutritionLogs: nutritionRows.map((row) => ({
      date: row.date,
      calories: row.calories,
      protein: row.protein,
      carbs: row.carbs,
      fat: row.fat,
      notes: row.notes,
      meals: (mealsByLog.get(row.id) ?? []).map((m) => ({
        name: m.name,
        calories: m.calories,
        protein: m.protein,
        carbs: m.carbs,
        fat: m.fat,
      })),
    })),
    programs,
    trainingLogs: trainingRows.map((row) => ({
      date: row.date,
      notes: row.notes,
      createdAt: row.created_at,
      exercises: (exercisesByLog.get(row.id) ?? []).map((ex) => ({
        name: ex.name,
        sets: (setsByExercise.get(ex.id) ?? []).map((set) => ({
          setNumber: set.set_number,
          weight: set.weight,
          reps: set.reps,
          rpe: set.rpe,
        })),
      })),
    })),
    personalRecords: recordRows.map((r) => ({ name: r.name, weight: r.weight, reps: r.reps, date: r.date })),
    plan: plan
      ? { name: plan.name, startDate: plan.start_date, durationWeeks: plan.duration_weeks }
      : null,
    streak,
    coach: coachRows[0] ? { displayName: coachRows[0].display_name } : null,
  });
}));

export default router;
