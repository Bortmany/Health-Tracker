import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

// Photos go to a throwaway folder for this file (the local-folder storage).
const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cut-photos-test-'));
process.env.UPLOAD_DIR = uploadDir;
for (const name of ['S3_BUCKET', 'S3_ENDPOINT', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_REGION']) {
  delete process.env[name];
}

const { app } = await import('../app.js');
const { pool } = await import('../db/pool.js');
const { SECRET, makeJpeg, makePng, makeWebp } = await import('../lib/testImages.js');

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
  await fs.rm(uploadDir, { recursive: true, force: true });
});

const PASSWORD = 'hunter2pass';
const today = new Date().toISOString().slice(0, 10);

async function register(role, label) {
  const email = `photos-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const res = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, displayName: `${label} User` }),
  });
  assert.equal(res.status, 201);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const { user } = await res.json();
  if (role === 'coach') await pool.query("UPDATE users SET role = 'coach' WHERE id = $1", [user.id]);
  return { cookie, user };
}

function api(pathname, who, { method = 'GET', body } = {}) {
  const headers = who ? { Cookie: who.cookie } : {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function upload(who, bytes, type = 'image/jpeg') {
  const headers = { 'Content-Type': type };
  if (who) headers.Cookie = who.cookie;
  return fetch(`${baseUrl}/photos?today=${today}`, { method: 'POST', headers, body: bytes });
}

async function uploadOk(who, bytes = makeJpeg(), type = 'image/jpeg') {
  const res = await upload(who, bytes, type);
  assert.equal(res.status, 201);
  return (await res.json()).photo;
}

// The file on disk behind a photo id.
async function fileKeyOf(photoId) {
  const { rows } = await pool.query('SELECT file_key FROM progress_photos WHERE id = $1', [photoId]);
  return rows[0]?.file_key ?? null;
}

async function fileExists(key) {
  try {
    await fs.access(path.join(uploadDir, key));
    return true;
  } catch {
    return false;
  }
}

async function link(coach, client) {
  const inviteRes = await api('/coach/invites', coach, { method: 'POST' });
  assert.equal(inviteRes.status, 201);
  const { inviteCode } = await inviteRes.json();
  const redeemRes = await api('/coach-link/redeem', client, { method: 'POST', body: { code: inviteCode } });
  assert.equal(redeemRes.status, 200);
}

async function assertError(res, status, code, message) {
  assert.equal(res.status, status);
  const body = await res.json();
  assert.equal(body.error.code, code);
  if (message) assert.equal(body.error.message, message);
  return body;
}

async function assertPlain404(res) {
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.deepEqual(Object.keys(body), ['error']);
  assert.equal(body.error.code, 'NOT_FOUND');
}

test('each photo type uploads, starts private, and lists newest first', async () => {
  const student = await register('consumer', 'types');

  const empty = await (await api('/photos', student)).json();
  assert.deepEqual(empty, { enabled: true, photos: [], count: 0, limit: 200 });

  const jpeg = await uploadOk(student, makeJpeg(), 'image/jpeg');
  const png = await uploadOk(student, makePng(), 'image/png');
  const webp = await uploadOk(student, makeWebp(), 'image/webp');

  for (const photo of [jpeg, png, webp]) {
    assert.equal(photo.takenOn, today);
    assert.equal(photo.sharedWithCoach, false);
    assert.equal(photo.url, `/api/photos/${photo.id}/file`);
    assert.ok(!Number.isNaN(Date.parse(photo.createdAt)));
  }
  assert.deepEqual(Object.keys(jpeg).sort(), ['createdAt', 'id', 'sharedWithCoach', 'takenOn', 'url']);

  // The stored key is random, with the extension of the real type.
  assert.match(await fileKeyOf(jpeg.id), /^[0-9a-f-]{36}\.jpg$/);
  assert.match(await fileKeyOf(png.id), /\.png$/);
  assert.match(await fileKeyOf(webp.id), /\.webp$/);

  const list = await (await api('/photos', student)).json();
  assert.equal(list.enabled, true);
  assert.equal(list.count, 3);
  assert.equal(list.limit, 200);
  assert.deepEqual(list.photos.map((p) => p.id), [webp.id, png.id, jpeg.id]);
});

test('the type is decided by the bytes: a PNG sent as image/jpeg is stored as a PNG', async () => {
  const student = await register('consumer', 'mislabel');
  const photo = await uploadOk(student, makePng(), 'image/jpeg');
  assert.match(await fileKeyOf(photo.id), /\.png$/);
  const file = await api(`/photos/${photo.id}/file`, student);
  assert.equal(file.headers.get('content-type'), 'image/png');
});

test('files that are not photos are refused with 415, and nothing is stored', async () => {
  const student = await register('consumer', 'wrongtype');
  const message = "That file isn't a photo we can use. Please choose a JPEG, PNG or WebP image.";

  await assertError(await upload(student, Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF'), 'application/pdf'), 415, 'UNSUPPORTED_TYPE', message);
  // A text file renamed photo.jpg, sent claiming to be a JPEG.
  await assertError(await upload(student, Buffer.from('hello, this is just a text file'), 'image/jpeg'), 415, 'UNSUPPORTED_TYPE', message);
  // Right first bytes, broken inside.
  await assertError(await upload(student, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x40, 1, 2, 3, 4, 5, 6]), 'image/jpeg'), 415, 'UNSUPPORTED_TYPE', message);
  // A JSON body is not a photo either.
  await assertError(await fetch(`${baseUrl}/photos?today=${today}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: student.cookie },
    body: JSON.stringify({ photo: 'x' }),
  }), 415, 'UNSUPPORTED_TYPE', message);
  // An empty body.
  await assertError(await upload(student, Buffer.alloc(0), 'image/jpeg'), 415, 'UNSUPPORTED_TYPE', message);

  const list = await (await api('/photos', student)).json();
  assert.equal(list.count, 0);
});

test('a photo just over 8 MB is refused with 413', async () => {
  const student = await register('consumer', 'big');
  const big = Buffer.concat([makeJpeg(), Buffer.alloc(8 * 1024 * 1024 + 1 - makeJpeg().length, 0)]);
  assert.equal(big.length, 8 * 1024 * 1024 + 1);
  await assertError(await upload(student, big, 'image/jpeg'), 413, 'TOO_LARGE', 'That photo is over 8 MB. Try a smaller one.');
  assert.equal((await (await api('/photos', student)).json()).count, 0);
});

test('an upload needs a real device day, and a sign-in', async () => {
  const student = await register('consumer', 'today');
  const bad = await fetch(`${baseUrl}/photos?today=2001-01-01`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg', Cookie: student.cookie },
    body: makeJpeg(),
  });
  assert.equal(bad.status, 400);
  assert.equal((await upload(null, makeJpeg())).status, 401);
});

test('location and device details are stripped from the stored file', async () => {
  const student = await register('consumer', 'exif');
  for (const [bytes, type] of [[makeJpeg(), 'image/jpeg'], [makePng(), 'image/png'], [makeWebp(), 'image/webp']]) {
    assert.ok(bytes.includes(Buffer.from(SECRET)));
    const photo = await uploadOk(student, bytes, type);
    const onDisk = await fs.readFile(path.join(uploadDir, await fileKeyOf(photo.id)));
    assert.equal(onDisk.includes(Buffer.from(SECRET)), false, `${type} still holds the location`);
    const served = Buffer.from(await (await api(`/photos/${photo.id}/file`, student)).arrayBuffer());
    assert.ok(served.equals(onDisk));
    const { rows } = await pool.query('SELECT size_bytes FROM progress_photos WHERE id = $1', [photo.id]);
    assert.equal(rows[0].size_bytes, onDisk.length);
  }
});

test('the 200-photo limit is enforced', async () => {
  const student = await register('consumer', 'limit');
  await pool.query(
    `INSERT INTO progress_photos (user_id, taken_on, file_key, content_type, size_bytes)
     SELECT $1::uuid, $2::date, 'limit-test-' || $1::text || '-' || n || '.jpg', 'image/jpeg', 10
     FROM generate_series(1, 199) AS n`,
    [student.user.id, today]
  );
  // Number 200 still fits.
  await uploadOk(student);
  const before = await fs.readdir(uploadDir);
  await assertError(await upload(student, makeJpeg()), 409, 'PHOTO_LIMIT', "You've reached the 200-photo limit. Delete one to add another.");
  // The refused upload left no file behind.
  assert.deepEqual((await fs.readdir(uploadDir)).sort(), before.sort());
  const list = await (await api('/photos', student)).json();
  assert.equal(list.count, 200);
});

test('the owner gets the file privately; another student and signed-out visitors do not', async () => {
  const owner = await register('consumer', 'owner');
  const other = await register('consumer', 'other');
  const photo = await uploadOk(owner, makePng(), 'image/png');

  const res = await api(`/photos/${photo.id}/file`, owner);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await res.arrayBuffer()).byteLength > 0, true);

  await assertPlain404(await api(`/photos/${photo.id}/file`, other));
  await assertPlain404(await api(`/photos/${photo.id}`, other, { method: 'PATCH', body: { sharedWithCoach: true } }));
  await assertPlain404(await api(`/photos/${photo.id}`, other, { method: 'DELETE' }));
  await assertPlain404(await api('/photos/not-a-uuid/file', owner));
  assert.equal((await api(`/photos/${photo.id}/file`, null)).status, 401);
  assert.equal((await api('/photos', null)).status, 401);

  // The other student's list never shows it; the owner's photo is unchanged.
  assert.equal((await (await api('/photos', other)).json()).count, 0);
  assert.equal((await api(`/photos/${photo.id}/file`, owner)).status, 200);
});

test('the share switch needs a real true or false', async () => {
  const student = await register('consumer', 'switch');
  const photo = await uploadOk(student);
  for (const value of ['true', 1, null, undefined]) {
    const res = await api(`/photos/${photo.id}`, student, { method: 'PATCH', body: { sharedWithCoach: value } });
    assert.equal(res.status, 400);
  }
  const res = await api(`/photos/${photo.id}`, student, { method: 'PATCH', body: { sharedWithCoach: true } });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).photo.sharedWithCoach, true);
});

test('ISOLATION: a coach sees a photo only while it is shared and the link is active', async () => {
  const coach = await register('coach', 'iso-coach');
  const student = await register('consumer', 'iso-student');
  await link(coach, student);
  const photo = await uploadOk(student, makeWebp(), 'image/webp');
  const listPath = `/coach/clients/${student.user.id}/photos`;
  const filePath = `${listPath}/${photo.id}/file`;

  // Private by default: not in the list, and the file is a plain 404.
  assert.deepEqual(await (await api(listPath, coach)).json(), { enabled: true, photos: [] });
  await assertPlain404(await api(filePath, coach));

  // Shared: in the list and the file opens.
  await api(`/photos/${photo.id}`, student, { method: 'PATCH', body: { sharedWithCoach: true } });
  const list = await (await api(listPath, coach)).json();
  assert.deepEqual(list, {
    enabled: true,
    photos: [{ id: photo.id, takenOn: today, createdAt: photo.createdAt, url: `/api${filePath}` }],
  });
  const file = await api(filePath, coach);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'image/webp');
  assert.equal(file.headers.get('cache-control'), 'private, no-store');
  assert.equal(file.headers.get('x-content-type-options'), 'nosniff');

  // Unshared again: gone at once.
  await api(`/photos/${photo.id}`, student, { method: 'PATCH', body: { sharedWithCoach: false } });
  assert.deepEqual((await (await api(listPath, coach)).json()).photos, []);
  await assertPlain404(await api(filePath, coach));

  // A shared photo of a DIFFERENT student can't be reached through this client's route.
  const stranger = await register('consumer', 'iso-stranger');
  const strangerPhoto = await uploadOk(stranger);
  await api(`/photos/${strangerPhoto.id}`, stranger, { method: 'PATCH', body: { sharedWithCoach: true } });
  await assertPlain404(await api(`${listPath}/${strangerPhoto.id}/file`, coach));
  await assertPlain404(await api(`/coach/clients/${stranger.user.id}/photos`, coach));
  await assertPlain404(await api(`/coach/clients/${stranger.user.id}/photos/${strangerPhoto.id}/file`, coach));

  // The student's own photo routes don't open for the coach either.
  await assertPlain404(await api(`/photos/${photo.id}/file`, coach));
});

test("ISOLATION: coach A can't see coach B's client's photos or measurements", async () => {
  const coachA = await register('coach', 'coach-a');
  const coachB = await register('coach', 'coach-b');
  const student = await register('consumer', 'b-client');
  await link(coachB, student);
  const photo = await uploadOk(student);
  await api(`/photos/${photo.id}`, student, { method: 'PATCH', body: { sharedWithCoach: true } });
  await api(`/logs/${today}`, student, { method: 'PUT', body: { chest: 100 } });

  // B sees them.
  assert.equal((await (await api(`/coach/clients/${student.user.id}/photos`, coachB)).json()).photos.length, 1);
  assert.equal((await api(`/coach/clients/${student.user.id}/photos/${photo.id}/file`, coachB)).status, 200);

  // A gets the plain 404 everywhere.
  await assertPlain404(await api(`/coach/clients/${student.user.id}/photos`, coachA));
  await assertPlain404(await api(`/coach/clients/${student.user.id}/photos/${photo.id}/file`, coachA));
  await assertPlain404(await api(`/coach/clients/${student.user.id}/measurements`, coachA));

  // A student (not a coach) can't use the coach routes at all.
  const outsider = await register('consumer', 'outsider');
  assert.equal((await api(`/coach/clients/${student.user.id}/photos`, outsider)).status, 403);
});

test('ISOLATION: after unlinking, every coach photo and measurement route is a 404', async () => {
  const coach = await register('coach', 'unlink-coach');
  const student = await register('consumer', 'unlink-student');
  await link(coach, student);
  const photo = await uploadOk(student);
  await api(`/photos/${photo.id}`, student, { method: 'PATCH', body: { sharedWithCoach: true } });
  await api(`/logs/${today}`, student, { method: 'PUT', body: { neck: 40 } });
  const base = `/coach/clients/${student.user.id}`;
  assert.equal((await api(`${base}/photos/${photo.id}/file`, coach)).status, 200);
  assert.equal((await api(`${base}/measurements`, coach)).status, 200);

  assert.equal((await api('/coach-link', student, { method: 'DELETE' })).status, 204);

  await assertPlain404(await api(`${base}/photos`, coach));
  await assertPlain404(await api(`${base}/photos/${photo.id}/file`, coach));
  await assertPlain404(await api(`${base}/measurements`, coach));
  // The student's own copies stay theirs.
  assert.equal((await api(`/photos/${photo.id}/file`, student)).status, 200);
});

test('deleting a photo removes the row and the file', async () => {
  const student = await register('consumer', 'delete');
  const photo = await uploadOk(student);
  const key = await fileKeyOf(photo.id);
  assert.equal(await fileExists(key), true);

  assert.equal((await api(`/photos/${photo.id}`, student, { method: 'DELETE' })).status, 204);
  assert.equal(await fileKeyOf(photo.id), null);
  assert.equal(await fileExists(key), false);
  await assertPlain404(await api(`/photos/${photo.id}/file`, student));
  await assertPlain404(await api(`/photos/${photo.id}`, student, { method: 'DELETE' }));
});

test('the data export lists photos (no file bytes) and includes measurements', async () => {
  const student = await register('consumer', 'export');
  const photo = await uploadOk(student);
  await api(`/photos/${photo.id}`, student, { method: 'PATCH', body: { sharedWithCoach: true } });
  await api(`/logs/${today}`, student, { method: 'PUT', body: { waist: 80, chest: 101.5, arms: 35, hips: 99, thighs: 58, neck: 38 } });

  const data = await (await api('/export', student)).json();
  assert.equal(data.photos.length, 1);
  assert.deepEqual(Object.keys(data.photos[0]).sort(), ['createdAt', 'id', 'sharedWithCoach', 'takenOn']);
  assert.equal(data.photos[0].id, photo.id);
  assert.equal(data.photos[0].takenOn, today);
  assert.equal(data.photos[0].sharedWithCoach, true);
  const log = data.dailyLogs.find((l) => l.date === today);
  assert.equal(log.chest, 101.5);
  assert.equal(log.arms, 35);
  assert.equal(log.hips, 99);
  assert.equal(log.thighs, 58);
  assert.equal(log.neck, 38);
});

test('deleting the account removes every photo file from storage', async () => {
  const student = await register('consumer', 'goodbye');
  const photos = [await uploadOk(student), await uploadOk(student, makePng(), 'image/png')];
  const keys = [];
  for (const photo of photos) keys.push(await fileKeyOf(photo.id));
  for (const key of keys) assert.equal(await fileExists(key), true);
  // A row whose file is already missing doesn't stop the deletion.
  await pool.query(
    `INSERT INTO progress_photos (user_id, taken_on, file_key, content_type, size_bytes)
     VALUES ($1, $2::date, $3, 'image/jpeg', 10)`,
    [student.user.id, today, `missing-${student.user.id}.jpg`]
  );

  const res = await api('/account', student, { method: 'DELETE', body: { password: PASSWORD } });
  assert.equal(res.status, 204);
  for (const key of keys) assert.equal(await fileExists(key), false);
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM progress_photos WHERE user_id = $1', [student.user.id]);
  assert.equal(rows[0].n, 0);
});

test('DORMANT: in production without the bucket settings, photos are switched off', async () => {
  const coach = await register('coach', 'dormant-coach');
  const student = await register('consumer', 'dormant');
  await link(coach, student);
  const photo = await uploadOk(student);
  await api(`/photos/${photo.id}`, student, { method: 'PATCH', body: { sharedWithCoach: true } });

  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.deepEqual(await (await api('/photos', student)).json(), { enabled: false, photos: [], count: 0, limit: 200 });
    await assertError(await upload(student, makeJpeg()), 503, 'PHOTOS_DISABLED', 'Photo uploads are coming soon');
    await assertPlain404(await api(`/photos/${photo.id}/file`, student));
    assert.deepEqual(await (await api(`/coach/clients/${student.user.id}/photos`, coach)).json(), { enabled: false, photos: [] });
    await assertPlain404(await api(`/coach/clients/${student.user.id}/photos/${photo.id}/file`, coach));
    const health = await (await fetch(`${baseUrl}/health`)).json();
    assert.equal(health.photos, 'dormant');
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
  assert.equal((await (await api('/photos', student)).json()).enabled, true);
});
