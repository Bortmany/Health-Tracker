import pg from 'pg';

const { Pool } = pg;

// Calendar dates (Postgres DATE columns: target date, log dates, plan start)
// come back as the plain 'YYYY-MM-DD' text Postgres stores, never as a
// JavaScript date-and-time. By default the database driver turns '2026-12-01'
// into midnight on the server's own clock, which the API then sends out as a
// full timestamp ("2026-11-30T20:00:00.000Z" on Oman time) — the date box
// can't show it, the countdown turns into "NaN", and the day can slip by one.
// Doing it here covers every query, including ones that forget `::text`.
export const DATE_TYPE_ID = 1082; // Postgres's built-in number for DATE
pg.types.setTypeParser(DATE_TYPE_ID, (value) => value);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Hosted Postgres (e.g. Railway) requires SSL; local Postgres doesn't support it.
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  // Connection-pool limits, set explicitly rather than relying on pg's defaults
  // so we stay well under the database's max_connections when more than one copy
  // of the server runs. All three are env-overridable for tuning on Railway.
  //   PG_POOL_MAX            — most connections this instance will open (default 10)
  //   PG_IDLE_TIMEOUT_MS     — close a connection after this long idle (default 30s)
  //   PG_CONNECTION_TIMEOUT_MS — give up waiting for a free connection (default 10s)
  max: Number(process.env.PG_POOL_MAX) || 10,
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS) || 30000,
  connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS) || 10000,
});
