import { Router } from 'express';

// Public, no login needed: the contact address shown on the Terms, Privacy and
// Refunds pages. Configurable through PRIVACY_CONTACT_EMAIL so the owner can
// change it on Railway without a code change; falls back to the owner's address.
const DEFAULT_CONTACT_EMAIL = 'naeljam@hotmail.com';

export function getContactEmail() {
  const configured = (process.env.PRIVACY_CONTACT_EMAIL ?? '').trim();
  return configured || DEFAULT_CONTACT_EMAIL;
}

const router = Router();

router.get('/contact', (_req, res) => {
  res.json({ contact: { email: getContactEmail() } });
});

export default router;
