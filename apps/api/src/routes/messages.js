import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import {
  addMessage,
  cleanMessageBody,
  findStudentThread,
  hasUnread,
  loadMessages,
  markThreadRead,
} from '../lib/messages.js';
import { requireAuth } from '../middleware/auth.js';

// The student's side of coach messages. The thread is always the one on the
// student's ACTIVE coach link, found in the database on every request — the
// browser never names a thread. No active coach means a plain "not found".
// (The coach's side lives in routes/coach.js.)

const router = Router();

router.use(requireAuth);

// Still a 404 either way (so older screens keep working), but the code tells
// the screen which situation this is: NO_COACH = this person has never had a
// coach; NOT_FOUND = they had one and the link has ended (or it just ended).
function notFound(res) {
  return res.status(404).json({ error: { message: 'Not found', code: 'NOT_FOUND' } });
}

async function noThread(res, userId) {
  const { rows } = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM coach_clients
       WHERE client_id = $1 AND status IN ('ended', 'revoked')
     ) AS had_coach`,
    [userId]
  );
  if (rows[0].had_coach) return notFound(res);
  return res.status(404).json({
    error: { message: "You don't have a coach yet.", code: 'NO_COACH' },
  });
}

// Literal paths first. Works for both roles: a student hears about their
// coach's messages, a coach about any active client's.
router.get('/unread', asyncHandler(async (req, res) => {
  res.json({ unread: await hasUnread(req.userId) });
}));

router.post('/read', asyncHandler(async (req, res) => {
  const thread = await findStudentThread(req.userId);
  if (!thread) return noThread(res, req.userId);
  await markThreadRead(thread.link_id, req.userId);
  res.json({ ok: true });
}));

router.get('/', asyncHandler(async (req, res) => {
  const thread = await findStudentThread(req.userId);
  if (!thread) return noThread(res, req.userId);
  const messages = await loadMessages(thread.link_id, req.userId);
  res.json({ thread: { otherName: thread.other_name }, messages });
}));

router.post('/', asyncHandler(async (req, res) => {
  const body = cleanMessageBody(req.body?.body);
  const thread = await findStudentThread(req.userId);
  if (!thread) return noThread(res, req.userId);
  const message = await addMessage(thread.link_id, req.userId, body);
  // The link ended between the two steps above.
  if (!message) return notFound(res);
  res.status(201).json({ message });
}));

export default router;
