import styles from './StatCard.module.css';

// Small metric card: micro-label, big display number, optional sub-line.
// subTone 'good' turns the sub-line green (never used to shame a miss).
export default function StatCard({ label, value, sub, subTone = 'neutral' }) {
  return (
    <div className={styles.card}>
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>{value}</div>
      {sub != null && (
        <div className={`${styles.sub} ${subTone === 'good' ? styles.good : ''}`.trim()}>{sub}</div>
      )}
    </div>
  );
}
