import jwt from 'jsonwebtoken';

const EXPIRY = '7d';

export function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: EXPIRY });
}

export function verifyToken(token) {
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  return payload.sub;
}
