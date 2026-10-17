import bcrypt from 'bcrypt';
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { hashEmailForHold } from '../lib/debtHold.js';
import { logger } from '../lib/logger.js';
import { deletePhoto } from '../lib/photoStorage.js';
import { cancelSubscriptionSafely } from '../lib/providerRetries.js';
import { stopSubscriptionsWhere } from '../lib/stopSubscriptions.js';
import { withTransaction } from '../lib/withTransaction.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

// DELETE /api/account — permanently erase the signed-in user and everything
// they have logged. This is the "delete my data" right that privacy law
// expects for health data. The current password must be sent in the body so a
// stolen session cookie alone can't wipe an account.
//
// Every foreign key in docs/schema.sql already cascades from users, but each
// table is deleted explicitly (children before parents, inside one
// transaction) so the wipe stays complete even if a future table forgets its
// cascade rule.
//
// The coach case: a coach's own account and links are removed, but their
// clients keep every program the coach wrote — the created_by_coach_id column
// is simply cleared (matching its ON DELETE SET NULL constraint). Client data
// is never touched — except the message threads shared with the departing
// person, which go with the link they belong to, for both people.
router.delete('/', asyncHandler(async (req, res) => {
  const { password } = req.body ?? {};
  // Must be a string: a non-string (array/object) would throw inside bcrypt.compare
  // and surface as a 500 instead of a clean 400.
  if (typeof password !== 'string' || password === '') {
    return res.status(400).json({
      error: { message: 'Your current password is required to delete your account', code: 'INVALID_INPUT' },
    });
  }

  const { rows } = await pool.query('SELECT password_hash, email FROM users WHERE id = $1', [req.userId]);
  const user = rows[0];
  if (!user) {
    return res.status(401).json({ error: { message: 'Not authenticated', code: 'NO_TOKEN' } });
  }
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({
      error: { message: 'That password is incorrect', code: 'INVALID_CREDENTIALS' },
    });
  }

  // A coach who is still owed money, or has a payout on its way, can't delete
  // yet: their payout and earnings records are kept for accounting, but
  // erasing the account now would leave that money with nobody to pay.
  // The balance is the NET of every unpaid row Cut collected: earnings count
  // up, refunds and chargebacks (negative rows) count down. Above zero Cut
  // owes the coach (blocked); below zero the coach owes Cut (allowed, but a
  // debt hold is recorded below so they can't sign up again until settled).
  const { rows: owed } = await pool.query(
    `SELECT
       COALESCE((SELECT SUM(coach_cents) FROM commission_ledger
                 WHERE coach_id = $1 AND settled_by = 'cut' AND payout_id IS NULL), 0)::int AS owed_cents,
       COALESCE((SELECT ARRAY_AGG(id) FROM commission_ledger
                 WHERE coach_id = $1 AND settled_by = 'cut' AND payout_id IS NULL), '{}') AS ledger_ids,
       (SELECT COUNT(*) FROM payouts WHERE coach_id = $1 AND status = 'pending')::int AS payouts_in_progress`,
    [req.userId]
  );
  const debtCents = owed[0].owed_cents < 0 ? -owed[0].owed_cents : 0;
  if (owed[0].owed_cents > 0 || owed[0].payouts_in_progress > 0) {
    return res.status(409).json({
      error: {
        message: 'You still have earnings waiting to be paid out, or a payout in progress. Please wait until your payout has arrived, then delete your account.',
        code: 'PAYOUT_PENDING',
      },
    });
  }

  // Stop every subscription at the payment company BEFORE the data goes: the
  // person's own paid subscriptions (AI plan or coaching), and any student
  // subscriptions on this person's coaching links. Deleting our records alone
  // would leave the payment company still charging the card. A cancel that
  // fails is saved and retried later (it never blocks the deletion).
  const { rows: ownSubs } = await pool.query(
    `SELECT id, provider_subscription_id FROM student_subscriptions
     WHERE user_id = $1 AND status <> 'ended' AND cancel_at_period_end = false`,
    [req.userId]
  );
  for (const sub of ownSubs) {
    await cancelSubscriptionSafely({
      providerSubscriptionId: sub.provider_subscription_id,
      subscriptionId: sub.id,
      reason: 'account deleted',
    });
  }
  await stopSubscriptionsWhere('cc.coach_id = $1 OR cc.client_id = $1', [req.userId]);

  // Progress photo files live outside the database: the transaction hands
  // back every file key it deleted, and the files are removed after it commits.
  const photoKeys = await withTransaction(async (client) => {
    // Messages first: everything this user sent, and every thread on their
    // links (both people's messages — a thread belongs to the link, and the
    // link goes below).
    await client.query(
      `DELETE FROM messages
       WHERE sender_id = $1
          OR coach_client_id IN (SELECT id FROM coach_clients WHERE coach_id = $1 OR client_id = $1)`,
      [req.userId]
    );

    // Coach/client links, in both directions: rows where this user is the
    // coach (including unredeemed invites) and rows where they are the client.
    await client.query('DELETE FROM coach_clients WHERE coach_id = $1 OR client_id = $1', [req.userId]);

    // Programs this user wrote as a coach stay with the clients who train on
    // them — only the link back to the departing coach is cleared.
    await client.query('UPDATE programs SET created_by_coach_id = NULL WHERE created_by_coach_id = $1', [req.userId]);

    // The user's own records. Nested children (program days/exercises, meals,
    // sets, habit ticks, check-ins) cascade off these parents — the same
    // cascades the app's normal delete endpoints rely on.
    const { rows: photoRows } = await client.query(
      'DELETE FROM progress_photos WHERE user_id = $1 RETURNING file_key',
      [req.userId]
    );
    await client.query('DELETE FROM checkins WHERE user_id = $1', [req.userId]);
    await client.query('DELETE FROM checkin_templates WHERE coach_id = $1', [req.userId]);
    await client.query('DELETE FROM user_plans WHERE user_id = $1', [req.userId]);
    await client.query('DELETE FROM ai_plan_adjustments WHERE user_id = $1', [req.userId]);
    await client.query('DELETE FROM ai_plan_attempts WHERE user_id = $1', [req.userId]);
    await client.query('DELETE FROM training_logs WHERE user_id = $1', [req.userId]);
    await client.query('DELETE FROM daily_logs WHERE user_id = $1', [req.userId]);
    await client.query('DELETE FROM programs WHERE user_id = $1', [req.userId]);
    await client.query('DELETE FROM injuries WHERE user_id = $1', [req.userId]);
    await client.query('DELETE FROM activities WHERE user_id = $1', [req.userId]);
    await client.query('DELETE FROM habits WHERE user_id = $1', [req.userId]);
    await client.query('DELETE FROM user_settings WHERE user_id = $1', [req.userId]);

    // Finally the account itself. The coach's payout and earnings records stay
    // for accounting, detached from the account (their coach_id is cleared by
    // the database; migration 035).
    // A coach who owes Cut money leaves a debt hold first (same transaction,
    // so there is never a deletion without it): only a keyed hash of the email.
    if (debtCents > 0) {
      await client.query(
        `INSERT INTO coach_debt_holds (email_hash, amount_cents, ledger_ids)
         VALUES ($1, $2, $3::uuid[])
         ON CONFLICT (email_hash) WHERE settled_at IS NULL DO NOTHING`,
        [hashEmailForHold(user.email), debtCents, owed[0].ledger_ids]
      );
    }
    await client.query('DELETE FROM users WHERE id = $1', [req.userId]);
    return photoRows.map((row) => row.file_key);
  });

  // The account is gone; now remove its photo files. A file that is already
  // missing is fine, and one that can't be removed right now is logged (by
  // key only) rather than failing a deletion that has already happened.
  for (const key of photoKeys) {
    try {
      await deletePhoto(key);
    } catch (err) {
      logger.error('Could not remove a deleted account\'s photo file', { fileKey: key, error: err });
    }
  }

  // Same cookie options the logout route uses, so the session cookie is
  // actually removed by the browser.
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
  res.status(204).end();
}));

export default router;
