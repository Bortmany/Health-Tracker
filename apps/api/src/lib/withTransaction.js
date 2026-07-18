import { pool } from '../db/pool.js';

// Thrown inside a withTransaction callback to abort the transaction without
// treating it as a server error: the transaction rolls back and withTransaction
// returns `value` (undefined if none was given) instead of re-throwing.
// Routes use this for mid-transaction early exits like a failed ownership check.
export class Rollback {
  constructor(value) {
    this.value = value;
  }
}

// Runs `fn(client)` inside one database transaction and returns its result.
// This wraps the pattern every nested write in the app uses: take a client
// from the pool, BEGIN, do the work, COMMIT — and on any error ROLLBACK,
// re-throw, and always hand the client back to the pool.
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof Rollback) return err.value;
    throw err;
  } finally {
    client.release();
  }
}
