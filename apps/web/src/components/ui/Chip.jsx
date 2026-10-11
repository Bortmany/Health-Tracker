import { ariaProps } from './ariaProps.js';
import Tooltip from './Tooltip.jsx';
import styles from './Chip.module.css';

// Small pill badge. Tones: neutral (default), accent (lime), warn (amber).
// `title` (hover hint) and any aria-* attribute are passed straight through.
export default function Chip({ tone = 'neutral', title, children, ...rest }) {
  const toneClass = tone === 'accent' ? styles.accent : tone === 'warn' ? styles.warn : '';
  const chip = (
    <span
      className={`${styles.chip} ${toneClass}`.trim()}
      tabIndex={title ? 0 : undefined}
      {...ariaProps(rest)}
    >
      {children}
    </span>
  );
  // A chip with a hint becomes reachable by keyboard so the hint shows on focus too.
  return title ? <Tooltip text={title} describe>{chip}</Tooltip> : chip;
}
