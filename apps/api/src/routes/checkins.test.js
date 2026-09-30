import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app } from '../app.js';
import { pool } from '../db/pool.js';
import { DEFAULT_CHECKIN_QUESTIONS } from '../lib/checkins.js';
import { addDays, weekStartOf } from '../lib/userToday.js';

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

// The server's own UTC day: always accepted as ?today= (it must be within a
// day of it), whatever time zone the test runner is in.
function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

async function register(role, label) {
  const email = `checkin-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

async function clientRow(coach, clientId, today = utcToday()) {
  const res = await api(`/coach/clients?today=${today}`, coach);
  assert.equal(res.status, 200);
  const { clients } = await res.json();
  return clients.find((c) => c.clientId === clientId);
}

async function send(student, body, today = utcToday()) {
  return api(`/checkins/current?today=${today}`, student, { method: 'PUT', body });
}

function fourAnswers(prefix = 'a') {
  return [`${prefix}1`, `${prefix}2`, '', `${prefix}4`];
}

test('a student with no coach sees hasCoach false and cannot send', async () => {
  const student = await register('consumer', 'lonely');
  const today = utcToday();

  const res = await api(`/checkins/current?today=${today}`, student);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    hasCoach: false,
    coachName: null,
    weekStart: weekStartOf(today),
    questions: [],
    checkin: null,
  });

  const putRes = await send(student, { mood: 3, answers: [], notes: null });
  assert.equal(putRes.status, 409);
  assert.equal((await putRes.json()).error.code, 'NO_COACH');

  const historyRes = await api('/checkins', student);
  assert.deepEqual(await historyRes.json(), { checkins: [] });
});

test('sending a check-in flips the coach list from due to done; a second send edits it', async () => {
  const coach = await register('coach', 'coach-flip');
  const student = await register('consumer', 'student-flip');
  await link(coach, student);
  const today = utcToday();

  const currentRes = await api(`/checkins/current?today=${today}`, student);
  const current = await currentRes.json();
  assert.equal(current.hasCoach, true);
  assert.equal(current.coachName, 'coach-flip User');
  assert.deepEqual(current.questions, [...DEFAULT_CHECKIN_QUESTIONS]);
  assert.deepEqual(current.questions, [
    'How did your training feel this week?',
    'How was your energy?',
    'How did you sleep?',
    'Is there anything your coach should know?',
  ]);
  assert.equal(current.checkin, null);

  let row = await clientRow(coach, student.user.id, today);
  assert.equal(row.checkinThisWeek, 'due');
  assert.equal(row.checkinSentAt, null);

  const firstRes = await send(student, { mood: 4, answers: fourAnswers('first'), notes: '  Knee felt fine  ' }, today);
  assert.equal(firstRes.status, 200);
  const { checkin: first } = await firstRes.json();
  assert.equal(first.weekStart, weekStartOf(today));
  assert.equal(first.mood, 4);
  assert.equal(first.notes, 'Knee felt fine');
  assert.deepEqual(first.answers, [
    { question: 'How did your training feel this week?', answer: 'first1' },
    { question: 'How was your energy?', answer: 'first2' },
    { question: 'How did you sleep?', answer: '' },
    { question: 'Is there anything your coach should know?', answer: 'first4' },
  ]);
  assert.ok(!Number.isNaN(Date.parse(first.submittedAt)));

  row = await clientRow(coach, student.user.id, today);
  assert.equal(row.checkinThisWeek, 'done');
  assert.equal(row.checkinSentAt, first.submittedAt);

  // Second send the same week: replaced, not appended; first sent time kept.
  const secondRes = await send(student, { mood: 2, answers: fourAnswers('second'), notes: null }, today);
  assert.equal(secondRes.status, 200);
  const { checkin: second } = await secondRes.json();
  assert.equal(second.id, first.id);
  assert.equal(second.mood, 2);
  assert.equal(second.notes, null);
  assert.equal(second.answers[0].answer, 'second1');
  assert.equal(second.submittedAt, first.submittedAt);
  assert.ok(Date.parse(second.updatedAt) >= Date.parse(first.updatedAt));

  const { rows } = await pool.query('SELECT COUNT(*)::integer AS n FROM checkins WHERE user_id = $1', [student.user.id]);
  assert.equal(rows[0].n, 1);

  const historyRes = await api('/checkins', student);
  const { checkins } = await historyRes.json();
  assert.equal(checkins.length, 1);
  assert.equal(checkins[0].mood, 2);

  const againRes = await api(`/checkins/current?today=${today}`, student);
  assert.equal((await againRes.json()).checkin.id, first.id);

  // The coach's view of the same client.
  const summaryRes = await api(`/coach/clients/${student.user.id}/summary?today=${today}`, coach);
  assert.equal(summaryRes.status, 200);
  const summary = await summaryRes.json();
  assert.equal(summary.checkinThisWeek.id, first.id);
  assert.equal(summary.checkinThisWeek.mood, 2);
  assert.equal(summary.thisWeek.weekStart, weekStartOf(today));
  assert.equal(typeof summary.thisWeek.habitsTicked, 'number');
  assert.equal(typeof summary.thisWeek.habitsPossible, 'number');
  assert.ok(!('calories' in summary.thisWeek));
  assert.ok(!('protein' in summary.thisWeek));

  const listRes = await api(`/coach/clients/${student.user.id}/checkins?today=${today}`, coach);
  assert.equal(listRes.status, 200);
  const list = await listRes.json();
  assert.equal(list.weekStart, weekStartOf(today));
  assert.equal(list.checkins.length, 1);
  assert.equal(list.checkins[0].id, first.id);
});

test('habitsPossible counts current habits times the days so far this week', async () => {
  const coach = await register('coach', 'coach-habits');
  const student = await register('consumer', 'student-habits');
  await link(coach, student);
  const today = utcToday();
  const { rows } = await pool.query(
    'SELECT COUNT(*)::integer AS n FROM habits WHERE user_id = $1 AND archived_at IS NULL',
    [student.user.id]
  );
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${weekStartOf(today)}T00:00:00Z`)) / 86400000) + 1;

  const res = await api(`/coach/clients/${student.user.id}/summary?today=${today}`, coach);
  const { thisWeek } = await res.json();
  assert.equal(thisWeek.habitsPossible, rows[0].n * days);
  assert.equal(thisWeek.habitsTicked, 0);
});

test('bad check-ins are refused with a plain message', async () => {
  const coach = await register('coach', 'coach-bad');
  const student = await register('consumer', 'student-bad');
  await link(coach, student);

  const cases = [
    { mood: 3, answers: ['only one'], notes: null }, // wrong number of answers
    { mood: 3, answers: [...fourAnswers(), 'extra'], notes: null },
    { mood: 0, answers: fourAnswers(), notes: null }, // mood out of range
    { mood: 6, answers: fourAnswers(), notes: null },
    { mood: 2.5, answers: fourAnswers(), notes: null },
    { mood: '3', answers: fourAnswers(), notes: null },
    { mood: 3, answers: ['x'.repeat(501), '', '', ''], notes: null }, // answer too long
    { mood: 3, answers: fourAnswers(), notes: 'x'.repeat(1001) }, // note too long
    { mood: 3, answers: [1, 2, 3, 4], notes: null },
    { mood: 3, answers: 'nope', notes: null },
    { mood: 3, answers: fourAnswers(), notes: 42 },
  ];
  for (const body of cases) {
    const res = await send(student, body);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80));
    const { error } = await res.json();
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.equal(typeof error.message, 'string');
  }

  // Right at the limits is fine.
  const okRes = await send(student, { mood: 5, answers: ['x'.repeat(500), '', '', ''], notes: 'y'.repeat(1000) });
  assert.equal(okRes.status, 200);

  // A day far from today is refused.
  const farRes = await send(student, { mood: 3, answers: fourAnswers(), notes: null }, '2020-01-06');
  assert.equal(farRes.status, 400);

  const { rows } = await pool.query('SELECT COUNT(*)::integer AS n FROM checkins WHERE user_id = $1', [student.user.id]);
  assert.equal(rows[0].n, 1);
});

test('coach question editor: 1 to 8 questions; new questions apply from the next check-in', async () => {
  const coach = await register('coach', 'coach-questions');
  const student = await register('consumer', 'student-questions');
  await link(coach, student);
  const today = utcToday();

  const getRes = await api('/coach/checkin-questions', coach);
  assert.equal(getRes.status, 200);
  assert.deepEqual((await getRes.json()).questions, [...DEFAULT_CHECKIN_QUESTIONS]);

  // A student cannot edit questions.
  const studentRes = await api('/coach/checkin-questions', student, { method: 'PUT', body: { questions: ['Hi?'] } });
  assert.equal(studentRes.status, 403);

  const badBodies = [
    {},
    { questions: [] },
    { questions: Array.from({ length: 9 }, (_, i) => `Question ${i + 1}?`) },
    { questions: ['   '] },
    { questions: ['x'.repeat(141)] },
    { questions: ['Fine?', 7] },
    { questions: 'Fine?' },
  ];
  for (const body of badBodies) {
    const res = await api('/coach/checkin-questions', coach, { method: 'PUT', body });
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80));
    assert.equal((await res.json()).error.code, 'VALIDATION_ERROR');
  }

  const eightRes = await api('/coach/checkin-questions', coach, {
    method: 'PUT',
    body: { questions: Array.from({ length: 8 }, (_, i) => (i === 0 ? 'x'.repeat(140) : `Question ${i + 1}?`)) },
  });
  assert.equal(eightRes.status, 200);
  assert.equal((await eightRes.json()).questions.length, 8);

  // Back to four defaults, and the student answers them.
  await api('/coach/checkin-questions', coach, { method: 'PUT', body: { questions: [...DEFAULT_CHECKIN_QUESTIONS] } });
  const firstRes = await send(student, { mood: 3, answers: fourAnswers('old'), notes: null }, today);
  assert.equal(firstRes.status, 200);
  const { checkin: first } = await firstRes.json();

  // A past week's check-in, sent against the old list, stored directly.
  const lastWeek = addDays(weekStartOf(today), -7);
  await pool.query(
    `INSERT INTO checkins (user_id, coach_id, week_start, mood, answers)
     VALUES ($1, $2, $3::date, 4, $4::jsonb)`,
    [student.user.id, coach.user.id, lastWeek, JSON.stringify([{ question: 'Old question?', answer: 'old answer' }])]
  );

  // The coach rewrites the list (trimmed on save).
  const putRes = await api('/coach/checkin-questions', coach, {
    method: 'PUT',
    body: { questions: ['  Did you hit your steps?  ', 'Any pain?'] },
  });
  assert.equal(putRes.status, 200);
  assert.deepEqual((await putRes.json()).questions, ['Did you hit your steps?', 'Any pain?']);
  assert.deepEqual(
    (await (await api('/coach/checkin-questions', coach)).json()).questions,
    ['Did you hit your steps?', 'Any pain?']
  );

  // The student now sees the new questions; what they already sent is unchanged.
  const current = await (await api(`/checkins/current?today=${today}`, student)).json();
  assert.deepEqual(current.questions, ['Did you hit your steps?', 'Any pain?']);
  assert.equal(current.checkin.id, first.id);
  assert.equal(current.checkin.answers.length, 4);
  assert.equal(current.checkin.answers[0].question, 'How did your training feel this week?');

  // Answering against the old count is refused; the new count is accepted.
  const staleRes = await send(student, { mood: 3, answers: fourAnswers(), notes: null }, today);
  assert.equal(staleRes.status, 400);
  const newRes = await send(student, { mood: 3, answers: ['Yes', 'No'], notes: null }, today);
  assert.equal(newRes.status, 200);
  const { checkin: updated } = await newRes.json();
  assert.deepEqual(updated.answers, [
    { question: 'Did you hit your steps?', answer: 'Yes' },
    { question: 'Any pain?', answer: 'No' },
  ]);

  // Last week's check-in kept its own question.
  const list = await (await api(`/coach/clients/${student.user.id}/checkins?today=${today}`, coach)).json();
  assert.equal(list.checkins.length, 2);
  assert.equal(list.checkins[0].weekStart, weekStartOf(today));
  assert.equal(list.checkins[1].weekStart, lastWeek);
  assert.deepEqual(list.checkins[1].answers, [{ question: 'Old question?', answer: 'old answer' }]);

  // Another coach's list is untouched by this coach's edit.
  const other = await register('coach', 'coach-questions-other');
  const otherQs = await (await api('/coach/checkin-questions', other)).json();
  assert.deepEqual(otherQs.questions, [...DEFAULT_CHECKIN_QUESTIONS]);
});

test('isolation: a coach only sees check-ins from their own active clients, sent to them', async () => {
  const coachA = await register('coach', 'coach-iso-a');
  const coachB = await register('coach', 'coach-iso-b');
  const studentA = await register('consumer', 'student-iso-a');
  const studentB = await register('consumer', 'student-iso-b');
  await link(coachA, studentA);
  await link(coachB, studentB);
  const today = utcToday();

  assert.equal((await send(studentB, { mood: 4, answers: fourAnswers('b'), notes: 'for B only' }, today)).status, 200);

  // Coach A cannot read coach B's client.
  for (const path of [
    `/coach/clients/${studentB.user.id}/checkins?today=${today}`,
    `/coach/clients/${studentB.user.id}/summary?today=${today}`,
  ]) {
    const res = await api(path, coachA);
    assert.equal(res.status, 404, path);
    assert.equal((await res.json()).error.code, 'NOT_FOUND');
  }
  assert.equal(await clientRow(coachA, studentB.user.id, today), undefined);

  // A malformed id is a plain 404 too.
  assert.equal((await api(`/coach/clients/not-a-uuid/checkins`, coachA)).status, 404);

  // Coach B ends the link: every check-in route for that client is now 404.
  const rowB = await clientRow(coachB, studentB.user.id, today);
  assert.equal(rowB.checkinThisWeek, 'done');
  const endRes = await api(`/coach/clients/${rowB.linkId}`, coachB, { method: 'DELETE' });
  assert.equal(endRes.status, 204);
  for (const path of [
    `/coach/clients/${studentB.user.id}/checkins?today=${today}`,
    `/coach/clients/${studentB.user.id}/summary?today=${today}`,
  ]) {
    assert.equal((await api(path, coachB)).status, 404, path);
  }

  // The student keeps their own history, but has no coach to send to now.
  const ownHistory = await (await api('/checkins', studentB)).json();
  assert.equal(ownHistory.checkins.length, 1);
  const noCoach = await (await api(`/checkins/current?today=${today}`, studentB)).json();
  assert.equal(noCoach.hasCoach, false);
  assert.equal((await send(studentB, { mood: 3, answers: [], notes: null }, today)).status, 409);

  // The student then joins coach A: coach A cannot see what was sent to coach B.
  await link(coachA, studentB);
  const rowA = await clientRow(coachA, studentB.user.id, today);
  assert.equal(rowA.checkinThisWeek, 'due');
  assert.equal(rowA.checkinSentAt, null);
  const listA = await (await api(`/coach/clients/${studentB.user.id}/checkins?today=${today}`, coachA)).json();
  assert.deepEqual(listA.checkins, []);
  const summaryA = await (await api(`/coach/clients/${studentB.user.id}/summary?today=${today}`, coachA)).json();
  assert.equal(summaryA.checkinThisWeek, null);
  const currentWithA = await (await api(`/checkins/current?today=${today}`, studentB)).json();
  assert.equal(currentWithA.coachName, 'coach-iso-a User');
  assert.equal(currentWithA.checkin, null);

  // Coach B's list no longer has the client at all.
  assert.equal(await clientRow(coachB, studentB.user.id, today), undefined);
});

test('the check-in week runs Monday to Sunday of the given day', async () => {
  // Pure calendar checks: Sunday 4 Oct 2026 belongs to the week of Monday
  // 28 Sept; Monday 5 Oct starts a new week.
  assert.equal(weekStartOf('2026-10-04'), '2026-09-28');
  assert.equal(weekStartOf('2026-10-05'), '2026-10-05');
  assert.equal(weekStartOf('2026-09-28'), '2026-09-28');

  const coach = await register('coach', 'coach-week');
  const student = await register('consumer', 'student-week');
  await link(coach, student);

  // ?today= must be within a day of the real date, so use yesterday, today and
  // tomorrow; each answers with the Monday of its own week.
  const utc = utcToday();
  const days = [addDays(utc, -1), utc, addDays(utc, 1)];
  for (const day of days) {
    const body = await (await api(`/checkins/current?today=${day}`, student)).json();
    assert.equal(body.weekStart, weekStartOf(day), day);
  }

  // Send on the earliest day. A later day in the same week sees it; a day in
  // the next week (when yesterday-to-tomorrow crosses a Sunday→Monday) does not.
  assert.equal((await send(student, { mood: 3, answers: fourAnswers(), notes: null }, days[0])).status, 200);
  for (const day of days.slice(1)) {
    const body = await (await api(`/checkins/current?today=${day}`, student)).json();
    const sameWeek = weekStartOf(day) === weekStartOf(days[0]);
    assert.equal(body.checkin !== null, sameWeek, day);
    const row = await clientRow(coach, student.user.id, day);
    assert.equal(row.checkinThisWeek, sameWeek ? 'done' : 'due', day);
  }
});

test('the data export includes check-ins, and deleting the account removes them', async () => {
  const coach = await register('coach', 'coach-export');
  const student = await register('consumer', 'student-export');
  await link(coach, student);
  const today = utcToday();
  assert.equal(
    (await send(student, { mood: 5, answers: fourAnswers('exp'), notes: 'export marker' }, today)).status,
    200
  );

  const exportRes = await api(`/export?today=${today}`, student);
  assert.equal(exportRes.status, 200);
  const data = await exportRes.json();
  assert.equal(data.checkins.length, 1);
  assert.equal(data.checkins[0].weekStart, weekStartOf(today));
  assert.equal(data.checkins[0].coachName, 'coach-export User');
  assert.equal(data.checkins[0].mood, 5);
  assert.equal(data.checkins[0].notes, 'export marker');
  assert.equal(data.checkins[0].answers[0].answer, 'exp1');

  // A coach's export includes their question list.
  await api('/coach/checkin-questions', coach, { method: 'PUT', body: { questions: ['Coach export question?'] } });
  const coachData = await (await api(`/export?today=${today}`, coach)).json();
  assert.deepEqual(coachData.checkinQuestions, ['Coach export question?']);

  // Deleting the student removes their check-ins.
  const delRes = await api('/account', student, { method: 'DELETE', body: { password: PASSWORD } });
  assert.equal(delRes.status, 204);
  const { rows } = await pool.query('SELECT COUNT(*)::integer AS n FROM checkins WHERE user_id = $1', [student.user.id]);
  assert.equal(rows[0].n, 0);

  // Deleting a coach removes their question list; check-ins other students
  // sent them stay with the students.
  const student2 = await register('consumer', 'student-export-2');
  await link(coach, student2);
  assert.equal((await send(student2, { mood: 3, answers: ['x'], notes: null }, today)).status, 200);
  const coachDel = await api('/account', coach, { method: 'DELETE', body: { password: PASSWORD } });
  assert.equal(coachDel.status, 204);
  const { rows: templateRows } = await pool.query(
    'SELECT COUNT(*)::integer AS n FROM checkin_templates WHERE coach_id = $1',
    [coach.user.id]
  );
  assert.equal(templateRows[0].n, 0);
  const history = await (await api('/checkins', student2)).json();
  assert.equal(history.checkins.length, 1);
});
