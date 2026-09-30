import { ApiError, request } from './client.js';

// Photo = { id, takenOn, sharedWithCoach, createdAt, url }. `url` is the
// server's own signed-in address for the image; the screens only ever load
// photos through it (see hooks/usePhotoFile.js), never a public link.

// ---- Student side ----

// -> { enabled, photos (newest first), count, limit }. `enabled: false` means
// photo storage isn't set up yet: not an error, the gallery says "coming soon".
export function getMyPhotos() {
  return request('/photos');
}

// Sends the chosen file itself as the body (no form wrapper). `today` is this
// device's own day, so the photo is dated the day it was added here.
// -> { photo }
export async function uploadPhoto(file, today) {
  const res = await fetch(`/api/photos?today=${encodeURIComponent(today)}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(data?.error?.message ?? 'Request failed', data?.error?.code, res.status);
  }
  return data;
}

// -> { photo }
export function setPhotoSharing(id, sharedWithCoach) {
  return request(`/photos/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sharedWithCoach }),
  });
}

// Removes the photo and its file for good. -> null (204)
export function deletePhoto(id) {
  return request(`/photos/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ---- Coach side ----

// Only the photos this client chose to share. 404 when this person isn't
// (or is no longer) this coach's client. -> { enabled, photos }
export function getClientPhotos(clientId) {
  return request(`/coach/clients/${encodeURIComponent(clientId)}/photos`);
}
