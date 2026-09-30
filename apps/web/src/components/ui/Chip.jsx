import { ariaProps } from './ariaProps.js';
import styles from './Chip.module.css';

// Small pill badge. Tones: neutral (default), accent (lime), warn (amber).
// `title` (hover hint) and any aria-* attribute are passed straight through.
export default function Chip({ tone = 'neutral', title, children, ...rest }) {
  const toneClass = tone === 'accent' ? styles.accent : tone === 'warn' ? styles.warn : '';
  return (
    <span className={`${styles.chip} ${toneClass}`.trim()} title={title} {...ariaProps(rest)}>
      {children}
    </span>
  );
}
