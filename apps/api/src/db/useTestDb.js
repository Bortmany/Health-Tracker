// Loaded before every test file (see the "test" script in apps/api/package.json).
// Points the app at the separate test database before the connection pool is
// created, and supplies a throwaway sign-in secret if none is set, so tests
// run the same way on any machine.
import { testDatabaseUrl } from './testDb.js';

process.env.DATABASE_URL = testDatabaseUrl();
process.env.DATABASE_SSL = 'false';
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = 'test-only-secret-not-used-anywhere-real-000000';
}
