// Runs once before the test suite: makes sure the separate test database
// exists on this computer and has every migration applied.
// Run it by hand with:  npm run test:db -w apps/api
import pg from 'pg';
import { databaseIdentity, databaseName, isLocalDatabase, testDatabaseUrl } from './testDb.js';

const url = testDatabaseUrl();
const name = databaseName(url);

if (!isLocalDatabase(url)) {
  console.error(
    `The test database must be on this computer (localhost), but it points somewhere else.\n` +
      `Tests delete and rewrite data, so they refuse to run against a remote database.\n` +
      `Set TEST_DATABASE_URL to a local database and try again.`
  );
  process.exit(1);
}
if (process.env.DATABASE_URL && databaseIdentity(url) === databaseIdentity(process.env.DATABASE_URL)) {
  console.error('TEST_DATABASE_URL is the same as DATABASE_URL. Give the tests their own database.');
  process.exit(1);
}
if (!/^[A-Za-z0-9_]+$/.test(name)) {
  console.error(`Test database name "${name}" should only use letters, numbers and underscores.`);
  process.exit(1);
}

// Connect to the built-in "postgres" database to create the test one if needed.
const adminUrl = new URL(url);
adminUrl.pathname = '/postgres';
const admin = new pg.Client({ connectionString: adminUrl.toString() });
try {
  await admin.connect();
} catch (err) {
  console.error(`Couldn't reach the local database server (${err.message}). Is Postgres running?`);
  process.exit(1);
}
const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
if (rowCount === 0) {
  console.log(`Creating test database "${name}"...`);
  await admin.query(`CREATE DATABASE "${name}"`);
}
await admin.end();

// Apply migrations to the test database using the normal migration runner.
process.env.DATABASE_URL = url;
process.env.DATABASE_SSL = 'false';
await import('./migrate.js');
