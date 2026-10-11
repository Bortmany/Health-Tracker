// Plain rules for progress photos: the checks made before an upload, the
// words for each refusal (the same sentences the server uses), and grouping
// photos by day. No React here, so each rule has a small test next to it
// (photos.test.js).

import { formatShortDay, localToday, toCalendarDay } from './localDate.js';

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const PHOTO_ACCEPT = PHOTO_TYPES.join(',');
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
export const PHOTO_LIMIT = 200;

export const PHOTO_MESSAGES = {
  UNSUPPORTED_TYPE: "That file isn't a photo we can use. Please choose a JPEG, PNG or WebP image.",
  TOO_LARGE: 'That photo is over 8 MB. Try a smaller one.',
  PHOTO_LIMIT: "You've reached the 200-photo limit. Delete one to add another.",
  RATE_LIMITED: "You've added a lot of photos today. Please try again tomorrow.",
  PHOTOS_DISABLED: 'Photo uploads are coming soon',
};

// The refusal sentence for a chosen file, or null when it can go up. The
// server checks the bytes again; this only saves a pointless wait.
export function checkPhotoFile(file, count = 0, limit = PHOTO_LIMIT) {
  if (Number(count) >= Number(limit)) return PHOTO_MESSAGES.PHOTO_LIMIT;
  if (!file || !PHOTO_TYPES.includes(file.type)) return PHOTO_MESSAGES.UNSUPPORTED_TYPE;
  if (typeof file.size !== 'number' || file.size > PHOTO_MAX_BYTES) return PHOTO_MESSAGES.TOO_LARGE;
  return null;
}

// What a failed upload says on its tile. The server's known refusals keep
// their exact words; anything else is a plain "Couldn't upload" with a retry.
export function uploadErrorMessage(error) {
  const code = error?.code;
  if (code && PHOTO_MESSAGES[code]) return PHOTO_MESSAGES[code];
  if (error?.status === 429) return PHOTO_MESSAGES.RATE_LIMITED;
  if (error?.status === 413) return PHOTO_MESSAGES.TOO_LARGE;
  if (error?.status === 415) return PHOTO_MESSAGES.UNSUPPORTED_TYPE;
  return "Couldn't upload";
}

// Only a plain hiccup is worth trying again as it is; a refusal (wrong type,
// too big, the limit, today's cap) would just be refused again.
export function canRetryUpload(error) {
  return uploadErrorMessage(error) === "Couldn't upload";
}

// Photos (already newest first from the server) grouped by the day they were
// taken, newest day first: [{ day, label: '8 Sept', photos }]. A photo with an
// unreadable day goes in its own "—" group at the end, never lost.
export function groupPhotosByDay(photos, today = localToday()) {
  if (!Array.isArray(photos)) return [];
  const groups = new Map();
  for (const photo of photos) {
    if (!photo) continue;
    const day = toCalendarDay(photo.takenOn) ?? '';
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(photo);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === b ? 0 : a === '' ? 1 : b === '' ? -1 : a < b ? 1 : -1))
    .map(([day, list]) => ({ day, label: formatShortDay(day || null, today), photos: list }));
}

// The label a photo tile reads out: "Photo from 8 Sept, shared".
export function photoAriaLabel(photo, { withCoach = false, today = localToday() } = {}) {
  const base = `Photo from ${formatShortDay(photo?.takenOn, today)}`;
  if (!withCoach) return base;
  return `${base}, ${photo?.sharedWithCoach ? 'shared' : 'private'}`;
}

// Where the viewer goes after a photo is deleted: the next one (older), or
// the one before it when the last was deleted, or nowhere (close).
export function indexAfterDelete(length, index) {
  const remaining = length - 1;
  if (remaining <= 0) return null;
  return Math.min(index, remaining - 1);
}

// Only the server's own photo addresses are ever loaded, never anything
// else a reply might carry.
export function isOwnPhotoUrl(url) {
  return typeof url === 'string' && /^\/api\/(photos|coach\/clients\/[^/]+\/photos)\/[^/]+\/file$/.test(url);
}
