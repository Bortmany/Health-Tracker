import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Hosted Postgres (e.g. Render) requires SSL; local Postgres doesn't support it.
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
