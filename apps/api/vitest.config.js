import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Explicit imports only (test/beforeAll/afterAll come from 'vitest' in
    // each file) rather than injected globals — matches how the suite was
    // written under node:test.
    globals: false,
    environment: 'node',
    setupFiles: ['./vitest.setup.js'],
    // The test files share one Postgres database and a couple of them
    // (rateLimit.test.js) flip process-wide env vars for the duration of the
    // file. Running files one-at-a-time in a fresh forked process each —
    // same as the old `node --test` (one child process per file) — avoids
    // both DB races and env leakage between files.
    fileParallelism: false,
    pool: 'forks',
    testTimeout: 20000,
  },
});
