import styles from './StatCard.module.css';

// Small metric card: micro-label, big display number, optional sub-line.
// subTone 'good' turns the sub-line green (never used to shame a miss);
// subTone 'warn' turns it amber for "needs a look" counts.
const TONE_CLASS = { good: styles.good, warn: styles.warn };
// valueTone colours the big figure itself: 'accent' (lime) or 'warn' (amber).
const VALUE_CLASS = { accent: styles.valueAccent, warn: styles.valueWarn };

// `hint` is hover/long-press text for labels that aren't self-explanatory.
export default function StatCard({ label, value, sub, subTone = 'neutral', hint, valueTone }) {
  return (
    <div className={styles.card}>
      <div className={styles.label} title={hint}>
        {label}
      </div>
      <div className={`${styles.value} ${VALUE_CLASS[valueTone] ?? ''}`.trim()}>{value}</div>
      {sub != null && <div className={`${styles.sub} ${TONE_CLASS[subTone] ?? ''}`.trim()}>{sub}</div>}
    </div>
  );
}
