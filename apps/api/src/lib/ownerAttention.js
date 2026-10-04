import { pool } from '../db/pool.js';
import { MANUAL_REVIEW_AFTER_DAYS } from './payoutRun.js';

// Everything on the money side that needs the owner's eyes, as plain-English
// sentences for the /admin/coaches screen. Owner only (the route is behind
// requireAdmin). Each item is { id, kind, message }.

function dollars(cents) {
  return Number.isInteger(cents) ? `$${(cents / 100).toFixed(2)}` : 'an amount';
}

export async function loadOwnerAttention() {
  const items = [];

  const { rows: payouts } = await pool.query(
    `SELECT p.id, p.amount_cents, p.status, p.attention, p.resolution_note, u.display_name
     FROM payouts p JOIN users u ON u.id = p.coach_id
     WHERE p.status = 'manual_review' OR (p.status = 'pending' AND p.attention IS NOT NULL)
        OR (p.status = 'failed' AND p.attention = 'paid_after_marked_failed')
     ORDER BY p.created_at`
  );
  for (const p of payouts) {
    const who = p.display_name || 'A coach';
    let message;
    if (p.status === 'failed') {
      const how = p.resolution_note ? 'you marked as not sent' : 'Cut released itself after it could not find the transfer';
      message = `A payout ${how} was actually sent by the payment company; the coach may be paid twice. Check now. (${who}, ${dollars(p.amount_cents)})`;
    } else if (p.status === 'manual_review') {
      message = `${who}'s payout of ${dollars(p.amount_cents)} has been waiting more than ${MANUAL_REVIEW_AFTER_DAYS} days, so Cut will not retry it by itself. Cut checks again every time you press Pay coaches now. Or check with the payment company yourself, then mark it as sent or not sent in the payout list below. The money stays on hold until then.`;
    } else if (p.attention === 'keyless_transfer_nearby') {
      message = `A transfer without our reference was found near the time of ${who}'s payout of ${dollars(p.amount_cents)}, so Cut cannot tell whether it is the same payout. The money stays on hold. Please check in Whop and mark it sent or not sent.`;
    } else if (p.attention === 'lookup_failed') {
      message = `Cut could not check whether ${who}'s payout of ${dollars(p.amount_cents)} went through. The money stays on hold and Cut will check again next time you press Pay coaches now.`;
    } else {
      message = `${who}'s payout of ${dollars(p.amount_cents)} got an unclear reply from the payment company. The money stays on hold and Cut will check again next time you press Pay coaches now.`;
    }
    items.push({ id: p.id, kind: p.status === 'failed' ? 'payout_paid_after_failed' : p.status === 'manual_review' ? 'payout_manual_review' : 'payout_unconfirmed', message });
  }

  const { rows: cancels } = await pool.query(
    `SELECT pc.id, pc.attempts, u.display_name AS student, cu.display_name AS coach
     FROM pending_cancels pc
     LEFT JOIN student_subscriptions s ON s.id = pc.subscription_id
     LEFT JOIN users u ON u.id = s.user_id
     LEFT JOIN coach_clients cc ON cc.id = s.coach_client_id
     LEFT JOIN users cu ON cu.id = cc.coach_id
     ORDER BY pc.created_at`
  );
  for (const c of cancels) {
    const what = c.student && c.coach ? `${c.student}'s subscription to ${c.coach}` : 'A coaching subscription';
    items.push({
      id: c.id,
      kind: 'cancel_pending',
      message: `${what} could not be stopped at the payment company yet, so the student may still be charged. Cut will try again next time you press Pay coaches now. If it keeps failing, cancel it by hand there.`,
    });
  }

  const { rows: refunds } = await pool.query(
    `SELECT r.provider_payment_id, r.amount_cents, r.reason, u.display_name AS coach
     FROM pending_refunds r LEFT JOIN users u ON u.id = r.coach_id
     WHERE r.status = 'pending' ORDER BY r.created_at`
  );
  for (const r of refunds) {
    items.push({
      id: r.provider_payment_id,
      kind: 'refund_pending',
      message: `A student's payment${r.coach ? ` for ${r.coach}` : ''} could not be used (${r.reason ?? 'the coaching could not start'}), and the automatic refund has not gone through yet. The coach was not credited. Cut will try again next time you press Pay coaches now; if it keeps failing, refund it by hand.`,
    });
  }

  const { rows: flagged } = await pool.query(
    `SELECT l.id, u.display_name AS coach
     FROM commission_ledger l LEFT JOIN users u ON u.id = l.coach_id
     WHERE l.owner_flag = 'non_usd_payment' ORDER BY l.created_at DESC LIMIT 50`
  );
  for (const f of flagged) {
    items.push({
      id: f.id,
      kind: 'non_usd_payment',
      message: `A payment${f.coach ? ` for ${f.coach}` : ''} could not be turned into a clear US dollar amount (another currency, or no usable amount). Cut did not credit the coach anything for it. Please work out their share by hand, and refund the student if needed.`,
    });
  }

  const { rows: reversals } = await pool.query(
    `SELECT l.id, u.display_name AS coach
     FROM commission_ledger l LEFT JOIN users u ON u.id = l.coach_id
     WHERE l.owner_flag = 'non_usd_reversal' ORDER BY l.created_at DESC LIMIT 50`
  );
  for (const r of reversals) {
    items.push({
      id: r.id,
      kind: 'reversal_needs_attention',
      message: `A refund or payment reversal${r.coach ? ` for ${r.coach}` : ''} needs a look by hand: it was in another currency, or Cut had no payment number to send the student's refund with. The coach was not credited. Please check the student has been refunded.`,
    });
  }

  return items;
}
