import express, { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { logger } from '../lib/logger.js';
import { BadImageError, sniffImageType, stripImageMetadata } from '../lib/photoImage.js';
import {
  PHOTO_COLUMNS,
  PHOTO_LIMIT,
  PHOTO_MAX_BYTES,
  sendPhotoFile,
  toPublicPhoto,
} from '../lib/photos.js';
import { deletePhoto, newFileKey, photosEnabled, savePhoto } from '../lib/photoStorage.js';
import { resolveToday } from '../lib/userToday.js';
import * as validate from '../lib/validate.js';
import { withTransaction, Rollback } from '../lib/withTransaction.js';
import { requireAuth } from '../middleware/auth.js';

// The student's own progress photos. Every photo starts private; the owner
// alone can list, view, share, unshare and delete it. (A linked coach's view
// of SHARED photos lives in routes/coach.js.)

const router = Router();

router.use(requireAuth);

function fail(res, status, code, message) {
  return res.status(status).json({ error: { message, code } });
}

function notFound(res) {
  return fail(res, 404, 'NOT_FOUND', 'Not found');
}

const UNSUPPORTED = "That file isn't a photo we can use. Please choose a JPEG, PNG or WebP image.";
const TOO_LARGE = 'That photo is over 8 MB. Try a smaller one.';
const LIMIT_REACHED = "You've reached the 200-photo limit. Delete one to add another.";
const DISABLED = 'Photo uploads are coming soon';

// Reads the upload's bytes whatever type the browser claimed (the type is
// decided by looking at the bytes), stopping at 8 MB: a too-big declared size
// is refused before anything is read, and a body that runs past 8 MB is cut off.
const readUploadBody = express.raw({ type: () => true, limit: PHOTO_MAX_BYTES });

function readBody(req, res) {
  return new Promise((resolve, reject) => {
    readUploadBody(req, res, (err) => (err ? reject(err) : resolve(req.body)));
  });
}

async function countPhotos(db, userId) {
  const { rows } = await db.query('SELECT COUNT(*)::integer AS n FROM progress_photos WHERE user_id = $1', [userId]);
  return rows[0].n;
}

async function findOwnPhoto(userId, id) {
  if (!validate.isUuid(id)) return null;
  const { rows } = await pool.query(
    `SELECT ${PHOTO_COLUMNS} FROM progress_photos WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return rows[0] ?? null;
}

router.get('/', asyncHandler(async (req, res) => {
  if (!photosEnabled()) {
    return res.json({ enabled: false, photos: [], count: 0, limit: PHOTO_LIMIT });
  }
  const { rows } = await pool.query(
    `SELECT ${PHOTO_COLUMNS} FROM progress_photos
     WHERE user_id = $1
     ORDER BY taken_on DESC, created_at DESC, id DESC`,
    [req.userId]
  );
  res.json({ enabled: true, photos: rows.map(toPublicPhoto), count: rows.length, limit: PHOTO_LIMIT });
}));

router.post('/', asyncHandler(async (req, res) => {
  if (!photosEnabled()) return fail(res, 503, 'PHOTOS_DISABLED', DISABLED);
  const takenOn = resolveToday(req.query.today);

  let body;
  try {
    body = await readBody(req, res);
  } catch (err) {
    if (err.type === 'entity.too.large' || err.status === 413) return fail(res, 413, 'TOO_LARGE', TOO_LARGE);
    throw err;
  }
  // A JSON or form body was already read by the app's own parsers: not a photo.
  if (!Buffer.isBuffer(body) || body.length === 0) return fail(res, 415, 'UNSUPPORTED_TYPE', UNSUPPORTED);

  const contentType = sniffImageType(body);
  if (!contentType) return fail(res, 415, 'UNSUPPORTED_TYPE', UNSUPPORTED);

  let clean;
  try {
    clean = stripImageMetadata(body, contentType);
  } catch (err) {
    if (err instanceof BadImageError) return fail(res, 415, 'UNSUPPORTED_TYPE', UNSUPPORTED);
    throw err;
  }

  // A quick check before storing anything; the real check is repeated below
  // with the account locked, so two uploads at once can't both squeeze in.
  if (await countPhotos(pool, req.userId) >= PHOTO_LIMIT) {
    return fail(res, 409, 'PHOTO_LIMIT', LIMIT_REACHED);
  }

  const fileKey = newFileKey(contentType);
  await savePhoto(fileKey, clean, contentType);

  let row;
  try {
    row = await withTransaction(async (client) => {
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.userId]);
      if (await countPhotos(client, req.userId) >= PHOTO_LIMIT) throw new Rollback(null);
      const { rows } = await client.query(
        `INSERT INTO progress_photos (user_id, taken_on, file_key, content_type, size_bytes)
         VALUES ($1, $2::date, $3, $4, $5)
         RETURNING ${PHOTO_COLUMNS}`,
        [req.userId, takenOn, fileKey, contentType, clean.length]
      );
      return rows[0];
    });
  } catch (err) {
    await deletePhoto(fileKey).catch((cleanupErr) => {
      logger.warn('Could not remove an unsaved photo file', { error: cleanupErr });
    });
    throw err;
  }
  if (!row) {
    await deletePhoto(fileKey).catch(() => {});
    return fail(res, 409, 'PHOTO_LIMIT', LIMIT_REACHED);
  }

  res.status(201).json({ photo: toPublicPhoto(row) });
}));

router.get('/:id/file', asyncHandler(async (req, res) => {
  if (!photosEnabled()) return notFound(res);
  const row = await findOwnPhoto(req.userId, req.params.id);
  if (!row) return notFound(res);
  if (!(await sendPhotoFile(res, row))) return notFound(res);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.id)) return notFound(res);
  const sharedWithCoach = validate.boolean(req.body?.sharedWithCoach, 'sharedWithCoach');
  const { rows } = await pool.query(
    `UPDATE progress_photos SET shared_with_coach = $3::boolean
     WHERE id = $1 AND user_id = $2
     RETURNING ${PHOTO_COLUMNS}`,
    [req.params.id, req.userId, sharedWithCoach]
  );
  if (!rows[0]) return notFound(res);
  res.json({ photo: toPublicPhoto(rows[0]) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.id)) return notFound(res);
  const { rows } = await pool.query(
    'DELETE FROM progress_photos WHERE id = $1 AND user_id = $2 RETURNING file_key',
    [req.params.id, req.userId]
  );
  if (!rows[0]) return notFound(res);
  // The row is gone, so nobody can reach the file any more; now remove it.
  // If storage can't be reached right now, the photo is still deleted for the
  // person; the leftover file is logged (by key only) to clean up.
  try {
    await deletePhoto(rows[0].file_key);
  } catch (err) {
    logger.error('Could not remove a deleted photo file', { fileKey: rows[0].file_key, error: err });
  }
  res.status(204).end();
}));

export default router;
