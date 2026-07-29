import Button from './Button.jsx';
import styles from './ConfirmDialog.module.css';

// In-app replacement for window.confirm: a dimmed overlay with a small
// card, a plain-English question, and Cancel next to one clearly-marked
// danger action — so destructive moments still look like Cut, not the OS.
export default function ConfirmDialog({
  open,
  message,
  confirmLabel = 'Yes, do it',
  onConfirm,
  onCancel,
  busy = false,
}) {
  if (!open) return null;
  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
