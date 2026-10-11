import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app } from '../app.js';
import { pool } from '../db/pool.js';
import { addDays } from '../lib/userToday.js';

let server;
let baseUrl;

before(() => {
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://localhost:${port}/api`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

const today = new Date().toISOString().slice(0, 10);

async function register(role, label) {
  const email = `measurements-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const res = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter2pass', displayName: `${label} User` }),
  });
  assert.equal(res.status, 201);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const { user } = await res.json();
  if (role === 'coach') await pool.query("UPDATE users SET role = 'coach' WHERE id = $1", [user.id]);
  return { cookie, user };
}

function api(path, who, { method = 'GET', body } = {}) {
  const headers = who ? { Cookie: who.cookie } : {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

const saveLog = (who, date, body) => api(`/logs/${date}`, who, { method: 'PUT', body });

async function link(coach, client) {
  const { inviteCode } = await (await api('/coach/invites', coach, { method: 'POST' })).json();
  const res = await api('/coach-link/redeem', client, { method: 'POST', body: { code: inviteCode } });
  assert.equal(res.status, 200);
}

test('out-of-range measurements are refused with a plain message', async () => {
  const student = await register('consumer', 'ranges');
  const cases = [
    [{ neck: 999 }, 'Neck should be between 15 and 80 cm.'],
    [{ neck: 14.9 }, 'Neck should be between 15 and 80 cm.'],
    [{ chest: 29 }, 'Chest should be between 30 and 250 cm.'],
    [{ chest: 251 }, 'Chest should be between 30 and 250 cm.'],
    [{ arms: 9 }, 'Arms should be between 10 and 100 cm.'],
    [{ arms: 101 }, 'Arms should be between 10 and 100 cm.'],
    [{ hips: 0 }, 'Hips should be between 30 and 250 cm.'],
    [{ hips: 1000 }, 'Hips should be between 30 and 250 cm.'],
    [{ thighs: 19 }, 'Thighs should be between 20 and 150 cm.'],
    [{ thighs: 151 }, 'Thighs should be between 20 and 150 cm.'],
    [{ chest: 'lots' }, 'Chest should be between 30 and 250 cm.'],
    [{ arms: -20 }, 'Arms should be between 10 and 100 cm.'],
    [{ neck: [40] }, 'Neck should be between 15 and 80 cm.'],
  ];
  for (const [body, message] of cases) {
    const res = await saveLog(student, today, body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.deepEqual(await res.json(), { error: { message, code: 'VALIDATION_ERROR' } });
  }
  // Nothing was saved.
  assert.equal((await (await api(`/logs/${today}`, student)).json()).log, null);
});

test('the edges of each range are accepted and come back as numbers', async () => {
  const student = await register('consumer', 'edges');
  const low = { chest: 30, arms: 10, hips: 30, thighs: 20, neck: 15 };
  const high = { chest: 250, arms: 100, hips: 250, thighs: 150, neck: 80 };
  const yesterday = addDays(today, -1);

  const lowRes = await saveLog(student, yesterday, low);
  assert.equal(lowRes.status, 200);
  const lowLog = (await lowRes.json()).log;
  for (const [key, value] of Object.entries(low)) assert.equal(lowLog[key], value);

  const highRes = await saveLog(student, today, { ...high, waist: 90 });
  assert.equal(highRes.status, 200);
  const read = (await (await api(`/logs/${today}`, student)).json()).log;
  for (const [key, value] of Object.entries(high)) assert.equal(read[key], value);

  // Decimals and numbers typed as text are fine; blanks are "not measured".
  const decimal = await saveLog(student, today, { chest: '101.5', arms: '', neck: null });
  assert.equal(decimal.status, 200);
  const decimalLog = (await decimal.json()).log;
  assert.equal(decimalLog.chest, 101.5);
  assert.equal(decimalLog.arms, null);
  assert.equal(decimalLog.neck, null);
});

test('saving a day again replaces its measurements (replace, not append)', async () => {
  const student = await register('consumer', 'replace');
  await saveLog(student, today, { chest: 100, arms: 35, hips: 98, thighs: 57, neck: 39 });
  await saveLog(student, today, { chest: 99 });

  const log = (await (await api(`/logs/${today}`, student)).json()).log;
  assert.equal(log.chest, 99);
  assert.equal(log.arms, null);
  assert.equal(log.hips, null);

  const { measurements } = await (await api(`/measurements?today=${today}`, student)).json();
  assert.equal(measurements.length, 1);
  assert.deepEqual(measurements[0], { date: today, waist: null, chest: 99, arms: null, hips: null, thighs: null, neck: null });
});

test('the measurement list: own days with a measurement, oldest first, inside the window', async () => {
  const student = await register('consumer', 'list');
  await saveLog(student, addDays(today, -2), { waist: 82 });
  await saveLog(student, addDays(today, -1), { weight: 80 }); // no measurement: left out
  await saveLog(student, today, { arms: 36 });
  await saveLog(student, addDays(today, -100), { neck: 40 }); // outside the default 90 days

  const { measurements } = await (await api(`/measurements?today=${today}`, student)).json();
  assert.deepEqual(measurements.map((m) => m.date), [addDays(today, -2), today]);
  assert.equal(measurements[0].waist, 82);
  assert.equal(measurements[1].arms, 36);

  const longer = await (await api(`/measurements?days=365&today=${today}`, student)).json();
  assert.equal(longer.measurements.length, 3);
  const short = await (await api(`/measurements?days=1&today=${today}`, student)).json();
  assert.deepEqual(short.measurements.map((m) => m.date), [today]);

  for (const days of ['0', '366', 'abc', '1.5', '-3']) {
    const res = await api(`/measurements?days=${days}`, student);
    assert.equal(res.status, 400, `days=${days}`);
  }
  assert.equal((await api('/measurements', null)).status, 401);

  // Another student sees none of it.
  const other = await register('consumer', 'list-other');
  assert.deepEqual(await (await api(`/measurements?today=${today}`, other)).json(), { measurements: [] });
});

test('a linked coach sees the measurements with no switch, and loses them on unlink', async () => {
  const coach = await register('coach', 'm-coach');
  const student = await register('consumer', 'm-student');
  await link(coach, student);
  await saveLog(student, today, { waist: 85, thighs: 60 });

  const res = await api(`/coach/clients/${student.user.id}/measurements?days=30&today=${today}`, coach);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    measurements: [{ date: today, waist: 85, chest: null, arms: null, hips: null, thighs: 60, neck: null }],
  });

  assert.equal((await api(`/coach/clients/${student.user.id}/measurements?days=0`, coach)).status, 400);
  assert.equal((await api('/coach/clients/not-a-uuid/measurements', coach)).status, 404);

  assert.equal((await api('/coach-link', student, { method: 'DELETE' })).status, 204);
  const after = await api(`/coach/clients/${student.user.id}/measurements`, coach);
  assert.equal(after.status, 404);
  assert.equal((await after.json()).measurements, undefined);
});

test('signed-out visitors are refused (401) on the student and coach measurement routes', async () => {
  const someId = '00000000-0000-0000-0000-000000000000';
  assert.equal((await api('/measurements', null)).status, 401);
  assert.equal((await api(`/coach/clients/${someId}/measurements`, null)).status, 401);
});
