import styles from './EmptyState.module.css';

// Dashed, centered placeholder for screens with nothing to show yet.
export default function EmptyState({ children, action }) {
  return (
    <div className={styles.empty}>
      <div>{children}</div>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
