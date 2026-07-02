import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

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
  await client.query('DELETE FROM program_days WHERE program_id = $1', [programId]);
  for (const [dayIndex, day] of days.entries()) {
    if (!day?.name) continue;
    const { rows } = await client.query(
      'INSERT INTO program_days (program_id, name, sort_order) VALUES ($1, $2, $3) RETURNING id',
      [programId, day.name, day.sortOrder ?? dayIndex]
    );
    const dayId = rows[0].id;
    for (const [exIndex, ex] of (day.exercises ?? []).entries()) {
      if (!ex?.name) continue;
      await client.query(
        `INSERT INTO program_exercises (program_day_id, name, target_sets, target_reps, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [dayId, ex.name, ex.targetSets ?? null, ex.targetReps ?? null, ex.sortOrder ?? exIndex]
      );
    }
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
  if (!name) {
    return res.status(400).json({ error: { message: 'name is required', code: 'INVALID_INPUT' } });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'INSERT INTO programs (user_id, name, description) VALUES ($1, $2, $3) RETURNING *',
      [req.userId, name, description ?? null]
    );
    const program = rows[0];
    await replaceDays(client, program.id, days);
    await client.query('COMMIT');
    res.status(201).json({ program: toPublicProgram(program, await fetchNestedDays(pool, program.id)) });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM programs WHERE id = $1 AND user_id = $2', [
    req.params.id,
    req.userId,
  ]);
  if (!rows[0]) {
    return res.status(404).json({ error: { message: 'Program not found', code: 'NOT_FOUND' } });
  }
  res.json({ program: toPublicProgram(rows[0], await fetchNestedDays(pool, rows[0].id)) });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const { name, description, archived, days } = req.body ?? {};

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: ownedRows } = await client.query(
      'SELECT id FROM programs WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (!ownedRows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: { message: 'Program not found', code: 'NOT_FOUND' } });
    }

    const { rows } = await client.query(
      `UPDATE programs
       SET name = COALESCE($2, name),
           description = COALESCE($3, description),
           archived_at = CASE WHEN $4::boolean IS NULL THEN archived_at
                               WHEN $4::boolean THEN now()
                               ELSE NULL END
       WHERE id = $1
       RETURNING *`,
      [req.params.id, name ?? null, description ?? null, archived ?? null]
    );
    const program = rows[0];

    if (days) {
      await replaceDays(client, program.id, days);
    }

    await client.query('COMMIT');
    res.json({ program: toPublicProgram(program, await fetchNestedDays(pool, program.id)) });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM programs WHERE id = $1 AND user_id = $2', [
    req.params.id,
    req.userId,
  ]);
  if (!rowCount) {
    return res.status(404).json({ error: { message: 'Program not found', code: 'NOT_FOUND' } });
  }
  res.status(204).end();
}));

export default router;
