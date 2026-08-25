// Loads the repo-root .env file before any test file runs, mirroring the
// `node --env-file-if-exists=../../.env` flag the old `node --test` script
// used. Existing environment variables (e.g. DISABLE_RATE_LIMIT=true, set by
// the npm "test" script) are never overwritten by the file — same precedence
// as --env-file-if-exists.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '../../.env');

if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}
