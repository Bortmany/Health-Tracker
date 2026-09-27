import { useEffect, useId, useRef } from 'react';
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
  const actionsRef = useRef(null);
  const messageId = useId();

  // Always points at the newest onCancel, so the effect below can run once
  // per open/close instead of restarting (and stealing focus) every render.
  const cancelRef = useRef(onCancel);
  useEffect(() => {
    cancelRef.current = onCancel;
  });

  // While the dialog is open: the safe choice (Cancel) starts focused,
  // Escape backs out the same way Cancel does, and the page behind stops
  // scrolling so the dialog is the only thing that moves.
  useEffect(() => {
    if (!open) return undefined;

    // Cancel is the first button inside the actions row.
    actionsRef.current?.querySelector('button')?.focus();

    function handleKeyDown(e) {
      if (e.key === 'Escape') cancelRef.current?.();
    }
    document.addEventListener('keydown', handleKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={messageId}
        onClick={(e) => e.stopPropagation()}
      >
        <p className={styles.message} id={messageId}>
          {message}
        </p>
        <div className={styles.actions} ref={actionsRef}>
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
