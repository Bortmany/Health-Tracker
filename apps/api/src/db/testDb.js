// Works out which database the automated tests use, so they never write into
// the development database.
//
// - If TEST_DATABASE_URL is set, that is used.
// - Otherwise it takes DATABASE_URL and adds "_test" to the database name
//   (cut -> cut_test).
// - With neither set, it uses a local database called "cut_test".
//
// For safety the tests only ever run against a database on this computer.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '']);

export function testDatabaseUrl(env = process.env) {
  if (env.TEST_DATABASE_URL) return env.TEST_DATABASE_URL;
  if (!env.DATABASE_URL) return 'postgres://localhost:5432/cut_test';

  const url = new URL(env.DATABASE_URL);
  const devName = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'cut';
  url.pathname = `/${devName}_test`;
  return url.toString();
}

export function isLocalDatabase(connectionString) {
  const { hostname } = new URL(connectionString);
  return LOCAL_HOSTS.has(hostname);
}

export function databaseName(connectionString) {
  return decodeURIComponent(new URL(connectionString).pathname.replace(/^\//, ''));
}
