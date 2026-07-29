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
  // The wrapper is always in the page (invisible when there's nothing to
  // say) so screen readers notice the message appearing and read it out.
  return (
    <div className={message ? styles.toast : styles.idle} role="status" aria-live="polite">
      {message}
    </div>
  );
}
