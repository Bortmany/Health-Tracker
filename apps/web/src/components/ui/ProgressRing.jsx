import styles from './ProgressRing.module.css';

// Conic-gradient progress ring. The filled arc is the accent color,
// the remainder is the raised surface color; center content defaults
// to the percentage.
export default function ProgressRing({ percent = 0, size = 72, children }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const innerSize = size - 14;
  return (
    <div
      className={styles.ring}
      style={{
        width: size,
        height: size,
        background: `conic-gradient(var(--color-accent) ${clamped}%, var(--color-surface-2) 0)`,
      }}
    >
      <div className={styles.inner} style={{ width: innerSize, height: innerSize }}>
        {children ?? `${clamped}%`}
      </div>
    </div>
  );
}
