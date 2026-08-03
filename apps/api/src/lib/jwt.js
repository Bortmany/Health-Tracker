import jwt from 'jsonwebtoken';

const EXPIRY = '7d';

// The token carries the account's "token version" (tv) from when it was signed.
// Bumping that number on the users row (on logout / account delete) makes every
// token signed with the old number stop working — server-side session
// revocation, so a copied cookie can't outlive a logout.
export function signToken(userId, tokenVersion = 0) {
  return jwt.sign({ sub: userId, tv: tokenVersion }, process.env.JWT_SECRET, { expiresIn: EXPIRY });
}

// Returns just the user id. Kept for callers that only need to know "who" and
// don't check revocation (e.g. the rate-limiter's per-user key).
export function verifyToken(token) {
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  return payload.sub;
}

// Returns the full payload ({ sub, tv }) so the auth middleware can compare the
// token's version against the account's current version.
export function verifyTokenPayload(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}
