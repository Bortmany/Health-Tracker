import crypto from 'node:crypto';

// Debt holds: a coach who owes Cut money may delete their account, but cannot
// register again with the same email until the owner marks the debt settled.
// Only a keyed hash of the email is kept (never the address itself).
//
// The key is derived from JWT_SECRET with a fixed label, so the hash can't be
// reused for anything else. Changing JWT_SECRET would orphan open holds, so
// settle them first or keep the secret stable.
export function hashEmailForHold(email) {
  const key = crypto.createHmac('sha256', process.env.JWT_SECRET).update('cut:coach-debt-hold:v1').digest();
  return crypto.createHmac('sha256', key).update(String(email).trim().toLowerCase()).digest('hex');
}

// True when this email has an unsettled hold. `db` is the pool or a client.
export async function hasOpenDebtHold(db, email) {
  const { rowCount } = await db.query(
    'SELECT 1 FROM coach_debt_holds WHERE email_hash = $1 AND settled_at IS NULL',
    [hashEmailForHold(email)]
  );
  return rowCount > 0;
}
