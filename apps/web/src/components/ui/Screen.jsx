import styles from './Screen.module.css';

// Page wrapper: outer padding, centered column, optional heading row.
// `width` (px) widens the column for the few laptop layouts that need it
// (Subscription 880, Coach page / Admin / Pricing 1040); every other screen
// keeps the 640px default.
export default function Screen({ title, label, actions, width, children }) {
  const hasHeader = title || label || actions;
  return (
    <div className={styles.screen} style={width ? { maxWidth: `${width}px` } : undefined}>
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
