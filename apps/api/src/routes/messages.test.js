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

const PASSWORD = 'hunter2pass';

async function register(role, label) {
  const email = `messages-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const res = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, displayName: `${label} User` }),
  });
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const { user } = await res.json();
  // Coaches are promoted through a verified path; the test flips the role.
  if (role === 'coach') {
    await pool.query("UPDATE users SET role = 'coach' WHERE id = $1", [user.id]);
    user.role = 'coach';
  }
  return { cookie, user };
}

function api(path, who, { method = 'GET', body } = {}) {
  const headers = { Cookie: who.cookie };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function link(coach, client) {
  const inviteRes = await api('/coach/invites', coach, { method: 'POST' });
  assert.equal(inviteRes.status, 201);
  const { inviteCode } = await inviteRes.json();
  const redeemRes = await api('/coach-link/redeem', client, { method: 'POST', body: { code: inviteCode } });
  assert.equal(redeemRes.status, 200);
}

async function clientRow(coach, clientId) {
  const res = await api('/coach/clients', coach);
  assert.equal(res.status, 200);
  const { clients } = await res.json();
  return clients.find((c) => c.clientId === clientId);
}

// The student's side and the coach's side of the same thread.
const studentSend = (student, body) => api('/messages', student, { method: 'POST', body: { body } });
const coachSend = (coach, clientId, body) =>
  api(`/coach/clients/${clientId}/messages`, coach, { method: 'POST', body: { body } });

async function unread(who) {
  const res = await api('/messages/unread', who);
  assert.equal(res.status, 200);
  return (await res.json()).unread;
}

async function assertNotFound(res) {
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error.code, 'NOT_FOUND');
  assert.equal(body.messages, undefined);
  assert.equal(body.thread, undefined);
}

test('both sides send and read one shared thread, oldest first, with the mine flag', async () => {
  const coach = await register('coach', 'coach-talk');
  const student = await register('consumer', 'student-talk');
  await link(coach, student);

  // A fresh link starts with an empty thread.
  const emptyRes = await api('/messages', student);
  assert.equal(emptyRes.status, 200);
  assert.deepEqual(await emptyRes.json(), { thread: { otherName: 'coach-talk User' }, messages: [] });

  const firstRes = await studentSend(student, '  Hello coach  ');
  assert.equal(firstRes.status, 201);
  const { message: first } = await firstRes.json();
  assert.equal(first.body, 'Hello coach', 'the text is trimmed');
  assert.equal(first.mine, true);
  assert.equal(first.readAt, null);
  assert.equal(typeof first.id, 'string');
  assert.equal(new Date(first.createdAt).toISOString(), first.createdAt);

  const replyRes = await coachSend(coach, student.user.id, 'Hi! How was the week?\nAny pain?');
  assert.equal(replyRes.status, 201);
  const { message: reply } = await replyRes.json();
  assert.equal(reply.mine, true);

  await studentSend(student, 'All good');

  const studentView = await (await api('/messages', student)).json();
  assert.equal(studentView.thread.otherName, 'coach-talk User');
  assert.deepEqual(studentView.messages.map((m) => m.body), ['Hello coach', 'Hi! How was the week?\nAny pain?', 'All good']);
  assert.deepEqual(studentView.messages.map((m) => m.mine), [true, false, true]);
  assert.deepEqual(Object.keys(studentView.messages[0]).sort(), ['body', 'createdAt', 'id', 'mine', 'readAt']);

  const coachRes = await api(`/coach/clients/${student.user.id}/messages`, coach);
  assert.equal(coachRes.status, 200);
  const coachView = await coachRes.json();
  assert.equal(coachView.thread.otherName, 'student-talk User');
  assert.deepEqual(coachView.messages.map((m) => m.body), ['Hello coach', 'Hi! How was the week?\nAny pain?', 'All good']);
  assert.deepEqual(coachView.messages.map((m) => m.mine), [false, true, false]);
  assert.deepEqual(coachView.messages.map((m) => m.id), studentView.messages.map((m) => m.id));
});

test('"Seen" and the unread dots change only when the other side opens the thread', async () => {
  const coach = await register('coach', 'coach-seen');
  const student = await register('consumer', 'student-seen');
  await link(coach, student);

  assert.equal(await unread(student), false);
  assert.equal(await unread(coach), false);
  assert.equal((await clientRow(coach, student.user.id)).unreadMessages, false);

  await studentSend(student, 'Question about squats');
  // The coach now has something unread; the sender does not.
  assert.equal(await unread(coach), true);
  assert.equal(await unread(student), false);
  assert.equal((await clientRow(coach, student.user.id)).unreadMessages, true);

  // Reading your OWN thread does not mark your own message seen.
  assert.deepEqual(await (await api('/messages/read', student, { method: 'POST' })).json(), { ok: true });
  let view = await (await api('/messages', student)).json();
  assert.equal(view.messages[0].readAt, null);
  assert.equal(await unread(coach), true);

  // Opening the thread (GET) alone does not count as reading it either.
  await api(`/coach/clients/${student.user.id}/messages`, coach);
  assert.equal(await unread(coach), true);

  const readRes = await api(`/coach/clients/${student.user.id}/messages/read`, coach, { method: 'POST' });
  assert.equal(readRes.status, 200);
  assert.deepEqual(await readRes.json(), { ok: true });
  view = await (await api('/messages', student)).json();
  assert.equal(typeof view.messages[0].readAt, 'string', 'the student now sees "Seen"');
  assert.equal(await unread(coach), false);
  assert.equal((await clientRow(coach, student.user.id)).unreadMessages, false);

  // And the other way round.
  await coachSend(coach, student.user.id, 'Keep your back straight');
  assert.equal(await unread(student), true);
  assert.equal(await unread(coach), false);
  // A coach's own message never lights the coach's Clients row.
  assert.equal((await clientRow(coach, student.user.id)).unreadMessages, false);
  let coachView = await (await api(`/coach/clients/${student.user.id}/messages`, coach)).json();
  assert.equal(coachView.messages[1].readAt, null);

  await api('/messages/read', student, { method: 'POST' });
  assert.equal(await unread(student), false);
  coachView = await (await api(`/coach/clients/${student.user.id}/messages`, coach)).json();
  assert.equal(typeof coachView.messages[1].readAt, 'string');
});

test('a thread is visible only to its two people', async () => {
  const coachA = await register('coach', 'coach-a');
  const coachB = await register('coach', 'coach-b');
  const studentA = await register('consumer', 'student-a');
  const studentB = await register('consumer', 'student-b');
  const loner = await register('consumer', 'loner');
  await link(coachA, studentA);
  await link(coachB, studentB);

  await studentSend(studentA, 'Private to coach A');
  await coachSend(coachA, studentA.user.id, 'Private reply');

  // Another coach cannot read, write or mark coach A's client's thread.
  await assertNotFound(await api(`/coach/clients/${studentA.user.id}/messages`, coachB));
  await assertNotFound(await coachSend(coachB, studentA.user.id, 'Let me in'));
  await assertNotFound(await api(`/coach/clients/${studentA.user.id}/messages/read`, coachB, { method: 'POST' }));
  // Coach A on coach B's client.
  await assertNotFound(await api(`/coach/clients/${studentB.user.id}/messages`, coachA));
  await assertNotFound(await coachSend(coachA, studentB.user.id, 'Hello stranger'));
  // A made-up or malformed client id looks exactly the same.
  await assertNotFound(await api('/coach/clients/00000000-0000-0000-0000-000000000000/messages', coachA));
  await assertNotFound(await api('/coach/clients/not-a-uuid/messages', coachA));

  // A student with no coach gets not found on every student route.
  await assertNotFound(await api('/messages', loner));
  await assertNotFound(await studentSend(loner, 'Anyone there?'));
  await assertNotFound(await api('/messages/read', loner, { method: 'POST' }));
  assert.equal(await unread(loner), false);

  // Another student sees only their own (empty) thread with their own coach.
  const otherView = await (await api('/messages', studentB)).json();
  assert.deepEqual(otherView, { thread: { otherName: 'coach-b User' }, messages: [] });

  // A student cannot use the coach routes to reach anyone's thread.
  const asStudent = await api(`/coach/clients/${studentA.user.id}/messages`, studentB);
  assert.equal(asStudent.status, 403);

  // Nothing leaked into the other threads or the other coach's dots.
  assert.equal(await unread(coachB), false);
  assert.equal(await unread(studentB), false);
  const { rows } = await pool.query(
    `SELECT COUNT(*)::integer AS n FROM messages m
     JOIN coach_clients cc ON cc.id = m.coach_client_id
     WHERE cc.coach_id = $1 OR cc.client_id = $2`,
    [coachB.user.id, studentB.user.id]
  );
  assert.equal(rows[0].n, 0);
});

test('after the coach ends the link the thread is gone for both, and reconnecting starts fresh', async () => {
  const coach = await register('coach', 'coach-end');
  const student = await register('consumer', 'student-end');
  await link(coach, student);

  await studentSend(student, 'Unread when the link ends');
  await coachSend(coach, student.user.id, 'Also unread');
  assert.equal(await unread(coach), true);
  assert.equal(await unread(student), true);

  const { linkId } = await clientRow(coach, student.user.id);
  const endRes = await api(`/coach/clients/${linkId}`, coach, { method: 'DELETE' });
  assert.equal(endRes.status, 204);

  await assertNotFound(await api('/messages', student));
  await assertNotFound(await studentSend(student, 'Hello?'));
  await assertNotFound(await api('/messages/read', student, { method: 'POST' }));
  await assertNotFound(await api(`/coach/clients/${student.user.id}/messages`, coach));
  await assertNotFound(await coachSend(coach, student.user.id, 'Hello?'));
  await assertNotFound(await api(`/coach/clients/${student.user.id}/messages/read`, coach, { method: 'POST' }));
  assert.equal(await unread(student), false);
  assert.equal(await unread(coach), false);

  // The rows are kept in the database, just out of reach.
  const { rows } = await pool.query('SELECT COUNT(*)::integer AS n FROM messages WHERE coach_client_id = $1', [linkId]);
  assert.equal(rows[0].n, 2);

  // Reconnecting makes a new link with an empty thread; the old one stays hidden.
  await link(coach, student);
  const fresh = await (await api('/messages', student)).json();
  assert.deepEqual(fresh.messages, []);
  assert.equal(await unread(student), false);
  assert.equal(await unread(coach), false);
  const coachFresh = await (await api(`/coach/clients/${student.user.id}/messages`, coach)).json();
  assert.deepEqual(coachFresh.messages, []);
});

test('empty, blank, non-text and over-long messages are refused in plain English', async () => {
  const coach = await register('coach', 'coach-valid');
  const student = await register('consumer', 'student-valid');
  await link(coach, student);

  for (const [who, send] of [
    ['student', (b) => api('/messages', student, { method: 'POST', body: b })],
    ['coach', (b) => api(`/coach/clients/${student.user.id}/messages`, coach, { method: 'POST', body: b })],
  ]) {
    for (const body of [{}, { body: '' }, { body: '   \n  ' }, { body: null }]) {
      const res = await send(body);
      assert.equal(res.status, 400, `${who} ${JSON.stringify(body)}`);
      assert.deepEqual(await res.json(), { error: { message: 'Write a message first.', code: 'VALIDATION_ERROR' } });
    }
    for (const body of [{ body: 42 }, { body: ['hi'] }, { body: { text: 'hi' } }]) {
      const res = await send(body);
      assert.equal(res.status, 400);
      assert.equal((await res.json()).error.code, 'VALIDATION_ERROR');
    }
    const tooLong = await send({ body: 'a'.repeat(2001) });
    assert.equal(tooLong.status, 400);
    assert.deepEqual(await tooLong.json(), {
      error: { message: 'Messages can be up to 2,000 characters.', code: 'VALIDATION_ERROR' },
    });
    // Exactly 2,000 (after trimming) is fine.
    const atLimit = await send({ body: ` ${'b'.repeat(2000)} ` });
    assert.equal(atLimit.status, 201);
    assert.equal((await atLimit.json()).message.body.length, 2000);
  }

  const view = await (await api('/messages', student)).json();
  assert.equal(view.messages.length, 2, 'only the two valid messages were saved');
});

test('the data export includes each thread, and account deletion removes the messages', async () => {
  const coach = await register('coach', 'coach-export');
  const student = await register('consumer', 'student-export');
  await link(coach, student);

  await studentSend(student, 'Exported question');
  await coachSend(coach, student.user.id, 'Exported answer');
  await api('/messages/read', student, { method: 'POST' });

  const studentExport = await (await api('/export', student)).json();
  assert.equal(studentExport.messageThreads.length, 1);
  const [thread] = studentExport.messageThreads;
  assert.equal(thread.otherName, 'coach-export User');
  assert.equal(thread.connection, 'current');
  assert.deepEqual(thread.messages.map((m) => [m.sender, m.body]), [
    ['you', 'Exported question'],
    ['coach-export User', 'Exported answer'],
  ]);
  assert.equal(thread.messages[0].readAt, null);
  assert.equal(typeof thread.messages[1].readAt, 'string');
  assert.equal(typeof thread.messages[0].sentAt, 'string');

  const coachExport = await (await api('/export', coach)).json();
  assert.equal(coachExport.messageThreads.length, 1);
  assert.equal(coachExport.messageThreads[0].otherName, 'student-export User');
  assert.deepEqual(coachExport.messageThreads[0].messages.map((m) => m.sender), ['student-export User', 'you']);

  // A person with no messages gets an empty list.
  const loner = await register('consumer', 'loner-export');
  assert.deepEqual((await (await api('/export', loner)).json()).messageThreads, []);

  const deleteRes = await api('/account', student, { method: 'DELETE', body: { password: PASSWORD } });
  assert.equal(deleteRes.status, 204);

  const { rows } = await pool.query(
    `SELECT COUNT(*)::integer AS n FROM messages WHERE sender_id = $1 OR sender_id = $2`,
    [student.user.id, coach.user.id]
  );
  assert.equal(rows[0].n, 0, 'the whole shared thread is gone');
  assert.deepEqual((await (await api('/export', coach)).json()).messageThreads, []);
  assert.equal(await unread(coach), false);
});

test('signed-out visitors are refused (401) on the student and coach message routes', async () => {
  const someId = '00000000-0000-0000-0000-000000000000';
  for (const [method, path] of [
    ['GET', '/messages'],
    ['POST', '/messages'],
    ['POST', '/messages/read'],
    ['GET', '/messages/unread'],
    ['GET', `/coach/clients/${someId}/messages`],
    ['POST', `/coach/clients/${someId}/messages`],
    ['POST', `/coach/clients/${someId}/messages/read`],
  ]) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : '{"body":"hi"}',
    });
    assert.equal(res.status, 401, `${method} ${path}`);
  }
});
