import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import * as validate from '../lib/validate.js';
import { Rollback, withTransaction } from '../lib/withTransaction.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// A malformed :id in the URL would otherwise reach Postgres as an invalid UUID
// and throw a 500 — this turns it into a clean "not found".
function notFound(res) {
  return res.status(404).json({ error: { message: 'Program not found', code: 'NOT_FOUND' } });
}

function toPublicProgram(row, days) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
    fromCoach: row.created_by_coach_id != null,
    days,
  };
}

function toPublicDay(row, exercises) {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    exercises,
  };
}

function toPublicExercise(row) {
  return {
    id: row.id,
    name: row.name,
    targetSets: row.target_sets,
    targetReps: row.target_reps,
    sortOrder: row.sort_order,
  };
}

export async function fetchNestedDays(client, programId) {
  const { rows: dayRows } = await client.query(
    'SELECT * FROM program_days WHERE program_id = $1 ORDER BY sort_order',
    [programId]
  );
  const { rows: exerciseRows } = await client.query(
    `SELECT pe.* FROM program_exercises pe
     JOIN program_days pd ON pd.id = pe.program_day_id
     WHERE pd.program_id = $1
     ORDER BY pe.sort_order`,
    [programId]
  );
  return dayRows.map((day) =>
    toPublicDay(
      day,
      exerciseRows.filter((e) => e.program_day_id === day.id).map(toPublicExercise)
    )
  );
}

export async function replaceDays(client, programId, days) {
  // A non-list `days` (or a list holding null/garbage) would otherwise crash the
  // route when we try to iterate it — reject it with a clean 400 instead.
  if (!Array.isArray(days)) {
    throw new validate.ValidationError('days must be a list');
  }

  // Deleting the days would silently unlink every past session logged against
  // them (the foreign key sets them to null). Remember the old days and which
  // sessions point at each one, so the links can be moved to the new days.
  const { rows: oldDays } = await client.query(
    'SELECT id, name, sort_order FROM program_days WHERE program_id = $1 ORDER BY sort_order',
    [programId]
  );
  const { rows: linkedLogs } = await client.query(
    `SELECT id, program_day_id FROM training_logs
     WHERE program_day_id IN (SELECT id FROM program_days WHERE program_id = $1)`,
    [programId]
  );

  await client.query('DELETE FROM program_days WHERE program_id = $1', [programId]);

  const newDays = [];
  for (const [dayIndex, day] of days.entries()) {
    if (!day?.name) continue;
    // Cap the day name and make sure its order is a whole number before either
    // reaches its column.
    const dayName = validate.stringLength(day.name, 'day name', { max: 200 });
    const daySortOrder = validate.nonNegativeNumber(day.sortOrder ?? dayIndex, 'day order', {
      integer: true, max: 10000,
    });
    const { rows } = await client.query(
      'INSERT INTO program_days (program_id, name, sort_order) VALUES ($1, $2, $3) RETURNING id',
      [programId, dayName, daySortOrder]
    );
    const dayId = rows[0].id;
    newDays.push({ id: dayId, name: dayName });
    const exercises = day.exercises ?? [];
    if (!Array.isArray(exercises)) {
      throw new validate.ValidationError('a day\'s exercises must be a list');
    }
    for (const [exIndex, ex] of exercises.entries()) {
      if (!ex?.name) continue;
      // target sets/reps go into INTEGER columns: a non-numeric or overflow
      // value here (from POST/PUT or the coach "assign program" route that
      // reuses this) would otherwise throw a Postgres error (a 500). Validate
      // them, along with the exercise name cap and its sort order.
      const exName = validate.stringLength(ex.name, 'exercise name', { max: 200 });
      const targetSets = validate.nonNegativeNumber(ex.targetSets, 'target sets', {
        optional: true, integer: true, max: 1000,
      });
      const targetReps = validate.nonNegativeNumber(ex.targetReps, 'target reps', {
        optional: true, integer: true, max: 10000,
      });
      const exSortOrder = validate.nonNegativeNumber(ex.sortOrder ?? exIndex, 'exercise order', {
        integer: true, max: 10000,
      });
      await client.query(
        `INSERT INTO program_exercises (program_day_id, name, target_sets, target_reps, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [dayId, exName, targetSets, targetReps, exSortOrder]
      );
    }
  }

  // Point past sessions at the replacement day: same name first, same position
  // as a fallback. A day that was truly removed leaves its sessions unlinked,
  // which is the correct outcome.
  for (const [position, oldDay] of oldDays.entries()) {
    const replacement = newDays.find((d) => d.name === oldDay.name) ?? newDays[position];
    if (!replacement) continue;
    const logIds = linkedLogs.filter((l) => l.program_day_id === oldDay.id).map((l) => l.id);
    if (logIds.length === 0) continue;
    await client.query(
      'UPDATE training_logs SET program_day_id = $1 WHERE id = ANY($2::uuid[])',
      [replacement.id, logIds]
    );
  }
}

router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM programs WHERE user_id = $1 ORDER BY archived_at IS NOT NULL, created_at DESC',
    [req.userId]
  );
  const programs = await Promise.all(
    rows.map(async (row) => toPublicProgram(row, await fetchNestedDays(pool, row.id)))
  );
  res.json({ programs });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { name, description, days = [] } = req.body ?? {};
  // Caps the name/description like every other text field in the app, so a
  // runaway request can't stuff an unbounded string into the database.
  const cleanName = validate.stringLength(name, 'name', { max: 200 });
  const cleanDescription = validate.stringLength(description, 'description', { optional: true, max: 2000 });

  const program = await withTransaction(async (client) => {
    const { rows } = await client.query(
      'INSERT INTO programs (user_id, name, description) VALUES ($1, $2, $3) RETURNING *',
      [req.userId, cleanName, cleanDescription]
    );
    await replaceDays(client, rows[0].id, days);
    return rows[0];
  });
  res.status(201).json({ program: toPublicProgram(program, await fetchNestedDays(pool, program.id)) });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.id)) return notFound(res);

  const { rows } = await pool.query('SELECT * FROM programs WHERE id = $1 AND user_id = $2', [
    req.params.id,
    req.userId,
  ]);
  if (!rows[0]) {
    return notFound(res);
  }
  res.json({ program: toPublicProgram(rows[0], await fetchNestedDays(pool, rows[0].id)) });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.id)) return notFound(res);

  const { name, description, archived, days } = req.body ?? {};
  // Same caps as creating a program, so an edit can't stuff in an unbounded string.
  const cleanName = validate.stringLength(name, 'name', { optional: true, max: 200 });
  const cleanDescription = validate.stringLength(description, 'description', { optional: true, max: 2000 });

  const program = await withTransaction(async (client) => {
    const { rows: ownedRows } = await client.query(
      'SELECT id FROM programs WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (!ownedRows[0]) throw new Rollback(null);

    const { rows } = await client.query(
      `UPDATE programs
       SET name = COALESCE($2, name),
           description = COALESCE($3, description),
           archived_at = CASE WHEN $4::boolean IS NULL THEN archived_at
                               WHEN $4::boolean THEN now()
                               ELSE NULL END
       WHERE id = $1
       RETURNING *`,
      [req.params.id, cleanName, cleanDescription, archived ?? null]
    );

    if (days) {
      await replaceDays(client, rows[0].id, days);
    }

    return rows[0];
  });

  if (!program) {
    return notFound(res);
  }
  res.json({ program: toPublicProgram(program, await fetchNestedDays(pool, program.id)) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.id)) return notFound(res);

  const { rowCount } = await pool.query('DELETE FROM programs WHERE id = $1 AND user_id = $2', [
    req.params.id,
    req.userId,
  ]);
  if (!rowCount) {
    return notFound(res);
  }
  res.status(204).end();
}));

export default router;
