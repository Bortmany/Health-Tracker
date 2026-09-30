import { request } from './client.js';

// Message = { id, body, createdAt, readAt, mine }. The server decides who can
// read a thread: a 404 means there is no active coaching connection.

// ---- Student side: the thread with my coach ----

// -> { thread: { otherName }, messages }
export function getMyThread() {
  return request('/messages');
}

// -> { message }
export function sendMyMessage(body) {
  return request('/messages', { method: 'POST', body: JSON.stringify({ body }) });
}

// -> { ok: true }
export function markMyThreadRead() {
  return request('/messages/read', { method: 'POST' });
}

// ---- Coach side: the thread with one client ----

function clientPath(clientId) {
  return `/coach/clients/${encodeURIComponent(clientId)}/messages`;
}

export function getClientThread(clientId) {
  return request(clientPath(clientId));
}

export function sendClientMessage(clientId, body) {
  return request(clientPath(clientId), { method: 'POST', body: JSON.stringify({ body }) });
}

export function markClientThreadRead(clientId) {
  return request(`${clientPath(clientId)}/read`, { method: 'POST' });
}

// ---- Both roles ----

// -> { unread: boolean }
export function getUnread() {
  return request('/messages/unread');
}
