import styles from './EmptyState.module.css';

// Dashed, centered placeholder for screens with nothing to show yet.
// Shows the house mannequin picture by default; pass image={null} to hide it,
// or image="/img/..." to use a different one.
export default function EmptyState({ children, action, image = '/img/empty.webp' }) {
  return (
    <div className={styles.empty}>
      {image && (
        <img
          className={styles.image}
          src={image}
          alt=""
          width="600"
          height="400"
          loading="lazy"
          decoding="async"
        />
      )}
      <div>{children}</div>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
