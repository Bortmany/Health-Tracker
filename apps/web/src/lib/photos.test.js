// Progress photo rules. Only plain 'YYYY-MM-DD' days are used, so these
// pass the same under TZ=Asia/Muscat and TZ=UTC.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PHOTO_MAX_BYTES,
  PHOTO_MESSAGES,
  canRetryUpload,
  checkPhotoFile,
  groupPhotosByDay,
  indexAfterDelete,
  isOwnPhotoUrl,
  photoAriaLabel,
  uploadErrorMessage,
} from './photos.js';

test('checkPhotoFile refuses the wrong type with the server sentence', () => {
  assert.equal(
    checkPhotoFile({ type: 'application/pdf', size: 1000 }, 0),
    "That file isn't a photo we can use. Please choose a JPEG, PNG or WebP image."
  );
  assert.equal(checkPhotoFile({ type: 'image/heic', size: 1000 }, 0), PHOTO_MESSAGES.UNSUPPORTED_TYPE);
  assert.equal(checkPhotoFile(null, 0), PHOTO_MESSAGES.UNSUPPORTED_TYPE);
});

test('checkPhotoFile refuses anything over 8 MB', () => {
  assert.equal(checkPhotoFile({ type: 'image/jpeg', size: PHOTO_MAX_BYTES + 1 }, 0), 'That photo is over 8 MB. Try a smaller one.');
  assert.equal(checkPhotoFile({ type: 'image/jpeg', size: PHOTO_MAX_BYTES }, 0), null);
});

test('checkPhotoFile refuses at the 200-photo limit', () => {
  assert.equal(
    checkPhotoFile({ type: 'image/png', size: 10 }, 200, 200),
    "You've reached the 200-photo limit. Delete one to add another."
  );
  assert.equal(checkPhotoFile({ type: 'image/webp', size: 10 }, 199, 200), null);
});

test('uploadErrorMessage keeps the server words and falls back to a plain line', () => {
  assert.equal(uploadErrorMessage({ status: 429, code: 'RATE_LIMITED' }), PHOTO_MESSAGES.RATE_LIMITED);
  assert.equal(uploadErrorMessage({ status: 429 }), PHOTO_MESSAGES.RATE_LIMITED);
  assert.equal(uploadErrorMessage({ status: 409, code: 'PHOTO_LIMIT' }), PHOTO_MESSAGES.PHOTO_LIMIT);
  assert.equal(uploadErrorMessage({ status: 413 }), PHOTO_MESSAGES.TOO_LARGE);
  assert.equal(uploadErrorMessage({ status: 500 }), "Couldn't upload");
  assert.equal(uploadErrorMessage(new TypeError('Failed to fetch')), "Couldn't upload");
  assert.equal(canRetryUpload({ status: 500 }), true);
  assert.equal(canRetryUpload({ status: 415, code: 'UNSUPPORTED_TYPE' }), false);
});

test('groupPhotosByDay groups newest day first and keeps the order inside', () => {
  const photos = [
    { id: 'a', takenOn: '2026-09-08' },
    { id: 'b', takenOn: '2026-09-08' },
    { id: 'c', takenOn: '2026-08-30' },
    { id: 'd', takenOn: 'broken' },
    { id: 'e', takenOn: '2025-12-31' },
  ];
  const groups = groupPhotosByDay(photos, '2026-09-30');
  assert.deepEqual(
    groups.map((g) => [g.label, g.photos.map((p) => p.id)]),
    [
      ['8 Sept', ['a', 'b']],
      ['30 Aug', ['c']],
      ['31 Dec 2025', ['e']],
      ['—', ['d']],
    ]
  );
  assert.deepEqual(groupPhotosByDay(null), []);
});

test('photoAriaLabel says shared or private only with a coach', () => {
  const photo = { takenOn: '2026-09-08', sharedWithCoach: true };
  assert.equal(photoAriaLabel(photo, { withCoach: true, today: '2026-09-30' }), 'Photo from 8 Sept, shared');
  assert.equal(
    photoAriaLabel({ ...photo, sharedWithCoach: false }, { withCoach: true, today: '2026-09-30' }),
    'Photo from 8 Sept, private'
  );
  assert.equal(photoAriaLabel(photo, { today: '2026-09-30' }), 'Photo from 8 Sept');
});

test('indexAfterDelete moves on, steps back at the end, or closes', () => {
  assert.equal(indexAfterDelete(3, 0), 0);
  assert.equal(indexAfterDelete(3, 2), 1);
  assert.equal(indexAfterDelete(1, 0), null);
});

test('isOwnPhotoUrl only accepts the server photo addresses', () => {
  assert.equal(isOwnPhotoUrl('/api/photos/abc/file'), true);
  assert.equal(isOwnPhotoUrl('/api/coach/clients/c1/photos/p1/file'), true);
  assert.equal(isOwnPhotoUrl('https://evil.example/x.jpg'), false);
  assert.equal(isOwnPhotoUrl('/api/photos/abc'), false);
  assert.equal(isOwnPhotoUrl(null), false);
});
