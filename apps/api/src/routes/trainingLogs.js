import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { normalizeExercises } from '../lib/trainingSets.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toPublicLog(row) {
  return {
    id: row.id,
    date: row.date,
    programId: row.program_id,
    programDayId: row.program_day_id,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function toPublicExercise(row, sets) {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    sets: sets.map((s) => ({
      id: s.id,
      setNumber: s.set_number,
      weight: s.weight,
      reps: s.reps,
      rpe: s.rpe,
    })),
  };
}

async function fetchNestedExercises(client, trainingLogId) {
  const { rows: exerciseRows } = await client.query(
    'SELECT * FROM training_log_exercises WHERE training_log_id = $1 ORDER BY sort_order',
    [trainingLogId]
  );
  const { rows: setRows } = await client.query(
    `SELECT s.* FROM training_log_sets s
     JOIN training_log_exercises e ON e.id = s.training_log_exercise_id
     WHERE e.training_log_id = $1
     ORDER BY s.set_number`,
    [trainingLogId]
  );
  return exerciseRows.map((row) =>
    toPublicExercise(row, setRows.filter((s) => s.training_log_exercise_id === row.id))
  );
}

async function replaceExercises(client, trainingLogId, exercises) {
  await client.query('DELETE FROM training_log_exercises WHERE training_log_id = $1', [trainingLogId]);
  for (const ex of normalizeExercises(exercises)) {
    const { rows } = await client.query(
      'INSERT INTO training_log_exercises (training_log_id, name, sort_order) VALUES ($1, $2, $3) RETURNING id',
      [trainingLogId, ex.name, ex.sortOrder]
    );
    const exerciseId = rows[0].id;
    for (const set of ex.sets) {
      await client.query(
        `INSERT INTO training_log_sets (training_log_exercise_id, set_number, weight, reps, rpe)
         VALUES ($1, $2, $3, $4, $5)`,
        [exerciseId, set.setNumber, set.weight, set.reps, set.rpe]
      );
    }
  }
}

router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const from = DATE_RE.test(req.query.from) ? req.query.from : '1970-01-01';
  const to = DATE_RE.test(req.query.to) ? req.query.to : '9999-12-31';

  const { rows } = await pool.query(
    'SELECT * FROM training_logs WHERE user_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date DESC, created_at DESC',
    [req.userId, from, to]
  );
  res.json({ trainingLogs: rows.map(toPublicLog) });
}));

// Most recent prior entry for an exercise: lets the Train page show "last
// time" weight/reps before the user enters today's sets.
router.get('/exercise-history', asyncHandler(async (req, res) => {
  const { name, before } = req.query;
  if (!name) {
    return res.status(400).json({ error: { message: 'name is required', code: 'INVALID_INPUT' } });
  }

  const { rows } = await pool.query(
    `SELECT tl.id AS training_log_id, tl.date, te.id AS exercise_id, te.name
     FROM training_log_exercises te
     JOIN training_logs tl ON tl.id = te.training_log_id
     WHERE tl.user_id = $1 AND te.name = $2 AND tl.id != COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000')
     ORDER BY tl.date DESC, tl.created_at DESC
     LIMIT 1`,
    [req.userId, name, before ?? null]
  );

  const entry = rows[0];
  if (!entry) {
    return res.json({ entry: null });
  }

  const { rows: setRows } = await pool.query(
    'SELECT * FROM training_log_sets WHERE training_log_exercise_id = $1 ORDER BY set_number',
    [entry.exercise_id]
  );

  res.json({
    entry: {
      trainingLogId: entry.training_log_id,
      date: entry.date,
      name: entry.name,
      sets: setRows.map((s) => ({ setNumber: s.set_number, weight: s.weight, reps: s.reps, rpe: s.rpe })),
    },
  });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM training_logs WHERE id = $1 AND user_id = $2', [
    req.params.id,
    req.userId,
  ]);
  if (!rows[0]) {
    return res.status(404).json({ error: { message: 'Training log not found', code: 'NOT_FOUND' } });
  }
  const exercises = await fetchNestedExercises(pool, rows[0].id);
  res.json({ trainingLog: { ...toPublicLog(rows[0]), exercises } });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { date, programId, programDayId, notes, exercises = [] } = req.body ?? {};
  if (!DATE_RE.test(date ?? '')) {
    return res.status(400).json({ error: { message: 'date must be YYYY-MM-DD', code: 'INVALID_INPUT' } });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO training_logs (user_id, date, program_id, program_day_id, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.userId, date, programId ?? null, programDayId ?? null, notes ?? null]
    );
    const trainingLog = rows[0];
    await replaceExercises(client, trainingLog.id, exercises);
    await client.query('COMMIT');
    const fullExercises = await fetchNestedExercises(pool, trainingLog.id);
    res.status(201).json({ trainingLog: { ...toPublicLog(trainingLog), exercises: fullExercises } });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const { date, programId, programDayId, notes, exercises } = req.body ?? {};
  if (date !== undefined && !DATE_RE.test(date)) {
    return res.status(400).json({ error: { message: 'date must be YYYY-MM-DD', code: 'INVALID_INPUT' } });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: ownedRows } = await client.query(
      'SELECT id FROM training_logs WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (!ownedRows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: { message: 'Training log not found', code: 'NOT_FOUND' } });
    }

    const { rows } = await client.query(
      `UPDATE training_logs
       SET date = COALESCE($2, date),
           program_id = COALESCE($3, program_id),
           program_day_id = COALESCE($4, program_day_id),
           notes = COALESCE($5, notes)
       WHERE id = $1
       RETURNING *`,
      [req.params.id, date ?? null, programId ?? null, programDayId ?? null, notes ?? null]
    );
    const trainingLog = rows[0];

    if (exercises) {
      await replaceExercises(client, trainingLog.id, exercises);
    }

    await client.query('COMMIT');
    const fullExercises = await fetchNestedExercises(pool, trainingLog.id);
    res.json({ trainingLog: { ...toPublicLog(trainingLog), exercises: fullExercises } });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM training_logs WHERE id = $1 AND user_id = $2', [
    req.params.id,
    req.userId,
  ]);
  if (!rowCount) {
    return res.status(404).json({ error: { message: 'Training log not found', code: 'NOT_FOUND' } });
  }
  res.status(204).end();
}));

export default router;
