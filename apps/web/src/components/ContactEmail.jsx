import { useLegalContact } from '../hooks/useLegal.js';
import styles from './ContactEmail.module.css';

// The owner's contact address as a mailto link, fetched from the API so it can
// be changed on Railway without touching the code. Shows a skeleton while
// loading; if the request fails, falls back to the owner's address (the same
// default the API uses) so the page never shows a gap.
const FALLBACK_EMAIL = 'naeljam@hotmail.com';

export default function ContactEmail() {
  const { data, isPending } = useLegalContact();

  if (isPending) {
    return <span className={`skeleton ${styles.skeleton}`} aria-label="Loading contact address" />;
  }

  const email = data?.email || FALLBACK_EMAIL;
  return <a href={`mailto:${email}`}>{email}</a>;
}
