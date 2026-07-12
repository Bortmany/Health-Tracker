import styles from './Chip.module.css';

// Small pill badge. Tones: neutral (default), accent (lime), warn (amber).
export default function Chip({ tone = 'neutral', children }) {
  const toneClass = tone === 'accent' ? styles.accent : tone === 'warn' ? styles.warn : '';
  return <span className={`${styles.chip} ${toneClass}`.trim()}>{children}</span>;
}
