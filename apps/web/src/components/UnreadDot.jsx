import styles from './UnreadDot.module.css';

// The "new messages" dot: a small lime circle with a ring, never a number and
// never red. `corner` pins it to the top-right of the nearest positioned
// parent (a nav label or a button's wrapper); otherwise it sits inline.
export default function UnreadDot({ corner = false }) {
  return (
    <span className={corner ? styles.corner : styles.dot} title="Unread messages">
      <span className={styles.hidden}>Unread messages</span>
    </span>
  );
}
