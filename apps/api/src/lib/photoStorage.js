// Where progress photo files are kept. This is the ONLY file in the app that
// knows about storage; everything else calls savePhoto / readPhoto /
// deletePhoto / photosEnabled with a file key.
//
// Three modes, decided from the environment on every call:
//   - "s3":      all five S3_* settings are present (a Railway Storage Bucket
//                or any S3-compatible store). Files are private objects: no
//                public address and no shareable links — the app itself reads
//                each file and hands it only to someone allowed to see it.
//   - "local":   development and tests. Files go in a folder, UPLOAD_DIR
//                (default: apps/api/uploads).
//   - "dormant": production without the S3 settings. Uploads are refused and
//                the photo list says photos aren't switched on yet. (A plain
//                folder on a Railway server would be wiped on every deploy.)
//
// File keys are always made here: a random id plus the extension of the type
// the file really is, never the name the person's device gave it.

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const S3_SETTINGS = ['S3_BUCKET', 'S3_ENDPOINT', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_REGION'];

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const DEFAULT_UPLOAD_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');

export function storageMode() {
  if (S3_SETTINGS.every((name) => process.env[name])) return 's3';
  if (process.env.NODE_ENV === 'production') return 'dormant';
  return 'local';
}

export function photosEnabled() {
  return storageMode() !== 'dormant';
}

// A fresh random key for a file of this (already checked) type.
export function newFileKey(contentType) {
  const ext = EXTENSIONS[contentType];
  if (!ext) throw new Error('Unsupported photo type');
  return `${crypto.randomUUID()}.${ext}`;
}

// ---- Local folder ----------------------------------------------------------

function uploadRoot() {
  return path.resolve(process.env.UPLOAD_DIR || DEFAULT_UPLOAD_DIR);
}

// The full path for a key, refusing anything that would land outside the
// upload folder (for example '../x' or an absolute path).
export function localPathFor(key) {
  if (typeof key !== 'string' || key === '' || key.includes('\0')) {
    throw new Error('Invalid file key');
  }
  const root = uploadRoot();
  const full = path.resolve(root, key);
  if (path.dirname(full) !== root || !full.startsWith(root + path.sep)) {
    throw new Error('Invalid file key');
  }
  return full;
}

const localDriver = {
  async save(key, bytes) {
    const full = localPathFor(key);
    await fs.mkdir(uploadRoot(), { recursive: true });
    // 'wx' never overwrites an existing file.
    await fs.writeFile(full, bytes, { flag: 'wx', mode: 0o600 });
  },
  async read(key) {
    const full = localPathFor(key);
    try {
      return await fs.readFile(full);
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  },
  async remove(key) {
    const full = localPathFor(key);
    try {
      await fs.unlink(full);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  },
};

// ---- S3-compatible bucket --------------------------------------------------

let s3Cache = null;

async function s3() {
  const settings = S3_SETTINGS.map((name) => process.env[name]).join('\n');
  if (s3Cache && s3Cache.settings === settings) return s3Cache;
  // Loaded only when a bucket is configured, so dev and tests never need it.
  const sdk = await import('@aws-sdk/client-s3');
  const client = new sdk.S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  });
  s3Cache = { settings, sdk, client, bucket: process.env.S3_BUCKET };
  return s3Cache;
}

const s3Driver = {
  async save(key, bytes, contentType) {
    const { sdk, client, bucket } = await s3();
    await client.send(new sdk.PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes,
      // No ACL is set: bucket objects are private unless made public, and
      // nothing here ever makes them public.
      ContentType: contentType,
    }));
  },
  async read(key) {
    const { sdk, client, bucket } = await s3();
    try {
      const out = await client.send(new sdk.GetObjectCommand({ Bucket: bucket, Key: key }));
      return Buffer.from(await out.Body.transformToByteArray());
    } catch (err) {
      if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  },
  async remove(key) {
    const { sdk, client, bucket } = await s3();
    // Deleting a file that is already gone is not an error in S3.
    await client.send(new sdk.DeleteObjectCommand({ Bucket: bucket, Key: key }));
  },
};

function driver() {
  const mode = storageMode();
  if (mode === 's3') return s3Driver;
  if (mode === 'local') return localDriver;
  const err = new Error('Photo storage is not switched on');
  err.code = 'PHOTOS_DISABLED';
  throw err;
}

export async function savePhoto(key, bytes, contentType) {
  await driver().save(key, bytes, contentType);
}

// The file's bytes, or null when it isn't there.
export async function readPhoto(key) {
  return driver().read(key);
}

// Removes a file. A file that is already gone is fine.
export async function deletePhoto(key) {
  await driver().remove(key);
}
