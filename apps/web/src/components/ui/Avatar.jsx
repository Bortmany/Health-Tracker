import styles from './Avatar.module.css';

// Initials in a lime circle — Cut's stand-in for a photo (no file storage yet).
// Two or more words → first letter of the first and last word; one word →
// its first two letters; nothing → "?".
export function initialsFor(name) {
  const words = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export default function Avatar({ name, size = 40 }) {
  return (
    <span
      className={styles.avatar}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-hidden="true"
    >
      {initialsFor(name)}
    </span>
  );
}
