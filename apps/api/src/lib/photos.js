// Progress photos: the shared pieces used by the student routes
// (routes/photos.js), the coach routes (routes/coach.js), the data export and
// account deletion. The files themselves are handled by lib/photoStorage.js.

import { readPhoto } from './photoStorage.js';

export const PHOTO_LIMIT = 200;
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;

export const PHOTO_COLUMNS = `id, user_id, taken_on::text AS taken_on, file_key, content_type, size_bytes,
  shared_with_coach, created_at`;

export function toPublicPhoto(row) {
  return {
    id: row.id,
    takenOn: row.taken_on,
    sharedWithCoach: row.shared_with_coach,
    createdAt: new Date(row.created_at).toISOString(),
    url: `/api/photos/${row.id}/file`,
  };
}

// What a coach sees: no share switch, and the file through the coach route.
export function toCoachPhoto(row, clientId) {
  return {
    id: row.id,
    takenOn: row.taken_on,
    createdAt: new Date(row.created_at).toISOString(),
    url: `/api/coach/clients/${clientId}/photos/${row.id}/file`,
  };
}

// Sends a photo's bytes privately. Returns false when the file is missing, so
// the route can answer with its plain "not found".
export async function sendPhotoFile(res, row) {
  const bytes = await readPhoto(row.file_key);
  if (!bytes) return false;
  res.set({
    'Content-Type': row.content_type,
    'Content-Length': String(bytes.length),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    // Shown in the page, never offered under any stored name.
    'Content-Disposition': 'inline',
  });
  res.status(200).end(bytes);
  return true;
}
