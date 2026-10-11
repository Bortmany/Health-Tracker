import styles from './Screen.module.css';

// Page wrapper: outer padding, centered column, optional heading row.
// `width` (px) widens the column for the few laptop layouts that need it
// (Subscription 880, Coach page / Admin / Pricing 1040); every other screen
// keeps the 640px default. `wide` is the 960px laptop layout (Progress and
// Clients); a phone is narrower than 640px either way, so it never changes.
export default function Screen({ title, label, actions, width, wide = false, children }) {
  const hasHeader = title || label || actions;
  return (
    <div className={`${styles.screen} ${wide ? styles.wide : ''}`.trim()} style={width ? { maxWidth: `${width}px` } : undefined}>
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
