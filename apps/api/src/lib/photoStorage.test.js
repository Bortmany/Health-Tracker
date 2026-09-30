import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import {
  deletePhoto,
  localPathFor,
  newFileKey,
  photosEnabled,
  readPhoto,
  savePhoto,
  storageMode,
} from './photoStorage.js';

const S3_VARS = ['S3_BUCKET', 'S3_ENDPOINT', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_REGION'];
const saved = {};
let dir;

before(async () => {
  for (const name of [...S3_VARS, 'NODE_ENV', 'UPLOAD_DIR']) saved[name] = process.env[name];
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cut-photo-storage-'));
});

beforeEach(() => {
  for (const name of S3_VARS) delete process.env[name];
  delete process.env.NODE_ENV;
  process.env.UPLOAD_DIR = dir;
});

after(async () => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await fs.rm(dir, { recursive: true, force: true });
});

test('the mode follows the settings: bucket, local folder, or asleep in production', () => {
  assert.equal(storageMode(), 'local');
  assert.equal(photosEnabled(), true);

  process.env.NODE_ENV = 'production';
  assert.equal(storageMode(), 'dormant');
  assert.equal(photosEnabled(), false);

  // Four of the five bucket settings is not enough.
  for (const name of S3_VARS.slice(0, 4)) process.env[name] = 'x';
  assert.equal(storageMode(), 'dormant');
  process.env.S3_REGION = 'auto';
  assert.equal(storageMode(), 's3');
  assert.equal(photosEnabled(), true);
});

test('dormant storage refuses to save or read', async () => {
  process.env.NODE_ENV = 'production';
  await assert.rejects(savePhoto(newFileKey('image/png'), Buffer.from('x'), 'image/png'), /not switched on/);
  await assert.rejects(readPhoto('a.png'), /not switched on/);
});

test('file keys are random with the extension of the real type', () => {
  const a = newFileKey('image/jpeg');
  const b = newFileKey('image/jpeg');
  assert.match(a, /^[0-9a-f-]{36}\.jpg$/);
  assert.notEqual(a, b);
  assert.match(newFileKey('image/png'), /\.png$/);
  assert.match(newFileKey('image/webp'), /\.webp$/);
  assert.throws(() => newFileKey('application/pdf'));
});

test('the local folder saves, reads and deletes; a missing file is not an error', async () => {
  const key = newFileKey('image/png');
  await savePhoto(key, Buffer.from('picture'), 'image/png');
  assert.equal((await readPhoto(key)).toString(), 'picture');
  assert.ok((await fs.readdir(dir)).includes(key));
  await deletePhoto(key);
  assert.equal(await readPhoto(key), null);
  await deletePhoto(key); // already gone: fine
});

test('the local folder refuses any key that would escape it', async () => {
  for (const key of ['../x', '../../etc/passwd', '/etc/passwd', 'sub/x.png', 'a/../../x', '.', '..', '', 'a\0b']) {
    assert.throws(() => localPathFor(key), /Invalid file key/, `key ${JSON.stringify(key)} should be refused`);
    await assert.rejects(savePhoto(key, Buffer.from('x'), 'image/png'), /Invalid file key/);
    await assert.rejects(readPhoto(key), /Invalid file key/);
    await assert.rejects(deletePhoto(key), /Invalid file key/);
  }
  // Nothing was written outside the folder.
  await assert.rejects(fs.access(path.join(dir, '..', 'x')));
});
