import styles from './Screen.module.css';

// Page wrapper: outer padding, centered column, optional heading row.
export default function Screen({ title, label, actions, children }) {
  const hasHeader = title || label || actions;
  return (
    <div className={styles.screen}>
      {hasHeader && (
        <header className={styles.header}>
          <div className={styles.heading}>
            {label && <div className={styles.label}>{label}</div>}
            {title && <h1 className={styles.title}>{title}</h1>}
          </div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </header>
      )}
      {children}
    </div>
  );
}
