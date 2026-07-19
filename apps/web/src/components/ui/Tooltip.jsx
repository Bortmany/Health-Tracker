import styles from './Tooltip.module.css';

// Wraps an icon-only button and shows a small text bubble when the mouse
// rests on it for a moment, or when it gets keyboard focus. Usage:
//   <Tooltip label="Previous day"><button aria-label="Previous day">←</button></Tooltip>
// Pure CSS, no JavaScript state — on touch screens the bubble simply never
// appears, and the button's aria-label remains its accessible name.
// The bubble is aria-hidden so screen readers don't hear the text twice.
export default function Tooltip({ label, children }) {
  return (
    <span className={styles.wrapper}>
      {children}
      <span className={styles.bubble} aria-hidden="true">
        {label}
      </span>
    </span>
  );
}
