import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './Toast.module.css';

// The app's one shared "it worked" pattern: call show('Saved') after a
// mutation succeeds and a small pill appears above the bottom nav for a
// couple of seconds, then disappears on its own.
export function useToast(duration = 2000) {
  const [message, setMessage] = useState(null);
  const timerRef = useRef(null);

  const show = useCallback(
    (msg) => {
      window.clearTimeout(timerRef.current);
      setMessage(msg);
      timerRef.current = window.setTimeout(() => setMessage(null), duration);
    },
    [duration]
  );

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  return { message, show };
}

export default function Toast({ message }) {
  if (!message) return null;
  return (
    <div className={styles.toast} role="status">
      {message}
    </div>
  );
}
