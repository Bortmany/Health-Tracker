import { Router } from 'express';
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

function notFound(res) {
  return res.status(404).json({ error: { message: 'Not found', code: 'NOT_FOUND' } });
}

// Literal paths first. Works for both roles: a student hears about their
// coach's messages, a coach about any active client's.
router.get('/unread', asyncHandler(async (req, res) => {
  res.json({ unread: await hasUnread(req.userId) });
}));

router.post('/read', asyncHandler(async (req, res) => {
  const thread = await findStudentThread(req.userId);
  if (!thread) return notFound(res);
  await markThreadRead(thread.link_id, req.userId);
  res.json({ ok: true });
}));

router.get('/', asyncHandler(async (req, res) => {
  const thread = await findStudentThread(req.userId);
  if (!thread) return notFound(res);
  const messages = await loadMessages(thread.link_id, req.userId);
  res.json({ thread: { otherName: thread.other_name }, messages });
}));

router.post('/', asyncHandler(async (req, res) => {
  const body = cleanMessageBody(req.body?.body);
  const thread = await findStudentThread(req.userId);
  if (!thread) return notFound(res);
  const message = await addMessage(thread.link_id, req.userId, body);
  // The link ended between the two steps above.
  if (!message) return notFound(res);
  res.status(201).json({ message });
}));

export default router;
