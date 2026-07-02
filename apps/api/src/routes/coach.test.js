import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app } from '../app.js';
import { pool } from '../db/pool.js';

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://localhost:${port}/api`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

async function register(role, label) {
  const email = `coach-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const res = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter2pass', displayName: `${label} User`, role }),
  });
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const { user } = await res.json();
  return { cookie, user };
}

test('full coach/client happy path', async () => {
  const coach = await register('coach', 'coach-happy');
  const client = await register('consumer', 'client-happy');

  // Coach creates an invite.
  const inviteRes = await fetch(`${baseUrl}/coach/invites`, {
    method: 'POST',
    headers: { Cookie: coach.cookie },
  });
  assert.equal(inviteRes.status, 201);
  const { inviteCode } = await inviteRes.json();
  assert.equal(inviteCode.length, 10);

  // Client redeems it.
  const redeemRes = await fetch(`${baseUrl}/coach-link/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: client.cookie },
    body: JSON.stringify({ code: inviteCode }),
  });
  assert.equal(redeemRes.status, 200);
  const redeemBody = await redeemRes.json();
  assert.equal(redeemBody.coach.displayName, 'coach-happy User');

  // Client sees the coach.
  const myCoachRes = await fetch(`${baseUrl}/coach-link`, { headers: { Cookie: client.cookie } });
  const myCoachBody = await myCoachRes.json();
  assert.equal(myCoachBody.coach.displayName, 'coach-happy User');

  // Coach lists clients.
  const clientsRes = await fetch(`${baseUrl}/coach/clients`, { headers: { Cookie: coach.cookie } });
  const clientsBody = await clientsRes.json();
  assert.equal(clientsBody.clients.length, 1);
  assert.equal(clientsBody.clients[0].clientId, client.user.id);
  assert.equal(clientsBody.clients[0].displayName, 'client-happy User');
  assert.equal(clientsBody.pendingInvites.length, 0);

  // Coach assigns a program with a day and exercise.
  const programRes = await fetch(`${baseUrl}/coach/clients/${client.user.id}/programs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: coach.cookie },
    body: JSON.stringify({
      name: 'Coach Plan',
      description: 'Assigned by coach',
      days: [{ name: 'Day 1', exercises: [{ name: 'Push-up', targetSets: 3, targetReps: 10 }] }],
    }),
  });
  assert.equal(programRes.status, 201);
  const { program } = await programRes.json();
  assert.equal(program.days.length, 1);
  assert.equal(program.days[0].exercises[0].name, 'Push-up');
  assert.equal(program.fromCoach, true);

  // Client sees the program with fromCoach = true.
  const clientProgramsRes = await fetch(`${baseUrl}/programs`, { headers: { Cookie: client.cookie } });
  const { programs } = await clientProgramsRes.json();
  const assigned = programs.find((p) => p.id === program.id);
  assert.ok(assigned);
  assert.equal(assigned.fromCoach, true);

  // Client logs a weight.
  const today = new Date().toISOString().slice(0, 10);
  await fetch(`${baseUrl}/logs/${today}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: client.cookie },
    body: JSON.stringify({ weight: 180.5 }),
  });

  // Coach reads the client summary.
  const summaryRes = await fetch(`${baseUrl}/coach/clients/${client.user.id}/summary`, {
    headers: { Cookie: coach.cookie },
  });
  assert.equal(summaryRes.status, 200);
  const summaryBody = await summaryRes.json();
  assert.equal(summaryBody.client.displayName, 'client-happy User');
  assert.ok(summaryBody.weighIns.some((w) => w.date.slice(0, 10) === today && Number(w.weight) === 180.5));
  assert.equal(summaryBody.programs.length, 1);
  assert.equal(summaryBody.programs[0].fromMe, true);
});

test('a consumer account cannot access coach routes', async () => {
  const consumer = await register('consumer', 'consumer-403');
  const res = await fetch(`${baseUrl}/coach/clients`, { headers: { Cookie: consumer.cookie } });
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error.code, 'COACH_ONLY');
});

test('a second coach cannot read another coach\'s client summary', async () => {
  const coachA = await register('coach', 'coach-a');
  const coachB = await register('coach', 'coach-b');
  const client = await register('consumer', 'client-isolated');

  const inviteRes = await fetch(`${baseUrl}/coach/invites`, {
    method: 'POST',
    headers: { Cookie: coachA.cookie },
  });
  const { inviteCode } = await inviteRes.json();
  await fetch(`${baseUrl}/coach-link/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: client.cookie },
    body: JSON.stringify({ code: inviteCode }),
  });

  const res = await fetch(`${baseUrl}/coach/clients/${client.user.id}/summary`, {
    headers: { Cookie: coachB.cookie },
  });
  assert.equal(res.status, 404);
});

test('redeeming a bogus invite code returns 404', async () => {
  const client = await register('consumer', 'client-bogus');
  const res = await fetch(`${baseUrl}/coach-link/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: client.cookie },
    body: JSON.stringify({ code: 'nope-not-a-real-code' }),
  });
  assert.equal(res.status, 404);
});
