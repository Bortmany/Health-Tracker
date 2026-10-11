// Coach-student messages: the shared pieces used by the student routes
// (routes/messages.js), the coach routes (routes/coach.js), the data export and
// account deletion.
//
// The safety rule: every read and write below re-checks, inside the same SQL
// statement, that the link is still ACTIVE and that the signed-in person is one
// of its two people. A link that has ended (or never existed) simply finds
// nothing, and the route answers with a plain "not found".

import { pool } from '../db/pool.js';
import { ValidationError } from './validate.js';

export const MAX_MESSAGE_LENGTH = 2000;
// How many of the newest messages a thread returns.
export const THREAD_LIMIT = 200;

export function toPublicMessage(row, userId) {
  return {
    id: row.id,
    body: row.body,
    createdAt: new Date(row.created_at).toISOString(),
    readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
    mine: row.sender_id === userId,
  };
}

// The message text, trimmed, or a plain-English 400.
export function cleanMessageBody(raw) {
  if (raw == null) throw new ValidationError('Write a message first.', 'VALIDATION_ERROR');
  if (typeof raw !== 'string') throw new ValidationError('Your message must be text.', 'VALIDATION_ERROR');
  const body = raw.trim();
  if (body === '') throw new ValidationError('Write a message first.', 'VALIDATION_ERROR');
  // Counted the way Postgres's char_length counts (whole characters), so the
  // limit here and the database's own check always agree.
  if ([...body].length > MAX_MESSAGE_LENGTH) {
    throw new ValidationError('Messages can be up to 2,000 characters.', 'VALIDATION_ERROR');
  }
  return body;
}

// The student's active link and their coach's name, or null.
export async function findStudentThread(studentId) {
  const { rows } = await pool.query(
    `SELECT cc.id AS link_id, u.display_name AS other_name
     FROM coach_clients cc
     JOIN users u ON u.id = cc.coach_id
     WHERE cc.client_id = $1 AND cc.status = 'active'`,
    [studentId]
  );
  return rows[0] ?? null;
}

// The coach's active link with this client and the client's name, or null.
export async function findCoachThread(coachId, clientId) {
  const { rows } = await pool.query(
    `SELECT cc.id AS link_id, u.display_name AS other_name
     FROM coach_clients cc
     JOIN users u ON u.id = cc.client_id
     WHERE cc.coach_id = $1 AND cc.client_id = $2 AND cc.status = 'active'`,
    [coachId, clientId]
  );
  return rows[0] ?? null;
}

// The part of every query that proves the link is active and ours.
const ACTIVE_LINK_FOR_USER = `cc.id = $1 AND cc.status = 'active' AND $2::uuid IN (cc.coach_id, cc.client_id)`;

// The newest messages on a link, returned oldest first.
export async function loadMessages(linkId, userId) {
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT m.id, m.sender_id, m.body, m.created_at, m.read_at
       FROM messages m
       JOIN coach_clients cc ON cc.id = m.coach_client_id
       WHERE ${ACTIVE_LINK_FOR_USER}
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT ${THREAD_LIMIT}
     ) latest
     ORDER BY created_at, id`,
    [linkId, userId]
  );
  return rows.map((row) => toPublicMessage(row, userId));
}

// Adds a message, only if the link is still active at that moment. Returns the
// new message, or null when the link has ended.
export async function addMessage(linkId, userId, body) {
  const { rows } = await pool.query(
    `INSERT INTO messages (coach_client_id, sender_id, body)
     SELECT cc.id, $2::uuid, $3
     FROM coach_clients cc
     WHERE ${ACTIVE_LINK_FOR_USER}
     RETURNING id, sender_id, body, created_at, read_at`,
    [linkId, userId, body]
  );
  return rows[0] ? toPublicMessage(rows[0], userId) : null;
}

// Marks the other person's unread messages on this link as read now.
export async function markThreadRead(linkId, userId) {
  await pool.query(
    `UPDATE messages m SET read_at = now()
     FROM coach_clients cc
     WHERE cc.id = m.coach_client_id
       AND ${ACTIVE_LINK_FOR_USER}
       AND m.sender_id <> $2::uuid
       AND m.read_at IS NULL`,
    [linkId, userId]
  );
}

// Is anything unread waiting for this person? As a student: from their active
// coach. As a coach (only while their account is a coach): from any active
// client.
export async function hasUnread(userId) {
  const { rows } = await pool.query(
    `SELECT EXISTS (
       SELECT 1
       FROM messages m
       JOIN coach_clients cc ON cc.id = m.coach_client_id
       WHERE cc.status = 'active'
         AND m.sender_id <> $1
         AND m.read_at IS NULL
         AND (
           cc.client_id = $1
           OR (cc.coach_id = $1 AND EXISTS (SELECT 1 FROM users WHERE id = $1 AND role = 'coach'))
         )
     ) AS unread`,
    [userId]
  );
  return rows[0].unread === true;
}

// Which of this coach's active clients have sent something the coach hasn't
// read yet (one query for everyone on the Clients list).
export async function clientsWithUnread(coachId, clientIds) {
  if (clientIds.length === 0) return new Set();
  const { rows } = await pool.query(
    `SELECT DISTINCT cc.client_id
     FROM messages m
     JOIN coach_clients cc ON cc.id = m.coach_client_id
     WHERE cc.coach_id = $1 AND cc.status = 'active'
       AND cc.client_id = ANY($2::uuid[])
       AND m.sender_id = cc.client_id
       AND m.read_at IS NULL`,
    [coachId, clientIds]
  );
  return new Set(rows.map((row) => row.client_id));
}
