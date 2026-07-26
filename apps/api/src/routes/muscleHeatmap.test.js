import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app } from '../app.js';
import { pool } from '../db/pool.js';

let server;
let baseUrl;
let cookie;

// Days are computed relative to today so the decay/window math is stable no
// matter when the suite runs.
const dayISO = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);

async function registerUser(label) {
  const email = `muscle-heatmap-${label}-${Date.now()}@example.com`;
  const res = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter2pass', displayName: `Heatmap ${label}` }),
  });
  return res.headers.get('set-cookie').split(';')[0];
}

async function postLog(userCookie, date, exercises) {
  const res = await fetch(`${baseUrl}/training-logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: userCookie },
    body: JSON.stringify({ date, exercises }),
  });
  assert.equal(res.status, 201);
}

async function getHeatmap(userCookie, query = '') {
  const res = await fetch(`${baseUrl}/muscle-heatmap${query}`, { headers: { Cookie: userCookie } });
  return { status: res.status, body: await res.json() };
}

const findMuscle = (body, muscle) => body.muscles.find((m) => m.muscle === muscle);

before(async () => {
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://localhost:${port}/api`;
  cookie = await registerUser('main');
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test('rejects requests without a session cookie', async () => {
  const res = await fetch(`${baseUrl}/muscle-heatmap`);
  assert.equal(res.status, 401);
});

test('a user with no training logs gets empty arrays', async () => {
  const emptyCookie = await registerUser('empty');
  const { status, body } = await getHeatmap(emptyCookie);
  assert.equal(status, 200);
  assert.equal(body.days, 30);
  assert.deepEqual(body.muscles, []);
  assert.deepEqual(body.unmatched, []);
});

test('3 fresh sets of Pull-up score lats at 33, above biceps, with no chest entry', async () => {
  await postLog(cookie, dayISO(0), [
    { name: 'Pull-up', sets: [{ reps: 8 }, { reps: 7 }, { reps: 6 }] },
  ]);
  const { status, body } = await getHeatmap(cookie);
  assert.equal(status, 200);

  const lats = findMuscle(body, 'lats');
  const biceps = findMuscle(body, 'biceps');
  // 3 sets today as a main mover: 100 * (3 / 9) = 33.
  assert.equal(lats.intensity, 33);
  assert.equal(lats.totalSets, 3);
  assert.ok(lats.intensity > biceps.intensity);
  // Each set counts toward every muscle it touches, so biceps sees 3 sets too.
  assert.equal(biceps.totalSets, 3);
  assert.equal(findMuscle(body, 'chest'), undefined);
});

test('weighted sets add volume; bodyweight sets count toward sets but add 0 volume', async () => {
  await postLog(cookie, dayISO(0), [
    { name: 'Bench press', sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }] },
    { name: 'Push-up', sets: [{ reps: 10 }] },
  ]);
  const { body } = await getHeatmap(cookie);
  const chest = findMuscle(body, 'chest');
  // 2 x 60kg x 8 reps = 960; the push-up set adds a set but no volume.
  assert.equal(chest.totalVolume, 960);
  assert.equal(chest.totalSets, 3);
  assert.equal(chest.lastTrained, dayISO(0));
  assert.ok(chest.topExercises.some((e) => e.name === 'Bench press'));
});

test('older training decays: same sets 10 days ago score far lower, lastTrained is correct', async () => {
  await postLog(cookie, dayISO(0), [
    { name: 'Dumbbell calf raise', sets: [{ weight: 20, reps: 12 }, { weight: 20, reps: 12 }, { weight: 20, reps: 12 }] },
  ]);
  await postLog(cookie, dayISO(10), [
    { name: 'Leg extension machine', sets: [{ weight: 30, reps: 12 }, { weight: 30, reps: 12 }, { weight: 30, reps: 12 }] },
  ]);
  const { body } = await getHeatmap(cookie);
  const calves = findMuscle(body, 'calves');
  const quads = findMuscle(body, 'quads');
  assert.ok(calves.intensity > quads.intensity);
  assert.equal(calves.lastTrained, dayISO(0));
  assert.equal(quads.lastTrained, dayISO(10));
});

test('the days window filters old logs: 10-day-old work is absent at days=7, present at days=30', async () => {
  const narrow = await getHeatmap(cookie, '?days=7');
  assert.equal(narrow.status, 200);
  assert.equal(narrow.body.days, 7);
  assert.equal(findMuscle(narrow.body, 'quads'), undefined);
  assert.ok(findMuscle(narrow.body, 'calves'));

  const wide = await getHeatmap(cookie, '?days=30');
  assert.ok(findMuscle(wide.body, 'quads'));
});

test('exercise names match the library case-insensitively', async () => {
  const lowerCookie = await registerUser('lowercase');
  await postLog(lowerCookie, dayISO(0), [
    { name: 'bench press', sets: [{ weight: 50, reps: 5 }] },
  ]);
  const { body } = await getHeatmap(lowerCookie);
  const chest = findMuscle(body, 'chest');
  assert.ok(chest);
  assert.equal(chest.totalVolume, 250);
});

test('an exercise the library does not know lands in unmatched, not on the map', async () => {
  const unknownCookie = await registerUser('unknown');
  await postLog(unknownCookie, dayISO(0), [
    { name: 'Cable woodchopper', sets: [{ weight: 15, reps: 12 }, { weight: 15, reps: 12 }] },
  ]);
  const { body } = await getHeatmap(unknownCookie);
  assert.deepEqual(body.muscles, []);
  assert.equal(body.unmatched.length, 1);
  assert.equal(body.unmatched[0].name, 'Cable woodchopper');
  assert.equal(body.unmatched[0].sets, 2);
  assert.equal(body.unmatched[0].lastLogged, dayISO(0));
});

test('a second user never sees another user\'s training', async () => {
  const otherCookie = await registerUser('isolated');
  const { body } = await getHeatmap(otherCookie);
  assert.deepEqual(body.muscles, []);
  assert.deepEqual(body.unmatched, []);
});

test('invalid days values are rejected with a plain-English 400', async () => {
  for (const bad of ['0', '200', 'abc']) {
    const { status, body } = await getHeatmap(cookie, `?days=${bad}`);
    assert.equal(status, 400, `days=${bad} should be rejected`);
    assert.equal(body.error.code, 'VALIDATION');
    assert.equal(body.error.message, 'days must be a whole number between 1 and 90');
  }
});
