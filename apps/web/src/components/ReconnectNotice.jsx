import { Button } from './ui/index.js';

// Shown instead of the login page when we couldn't ask the server who is
// signed in (busy server or no connection). The person is NOT signed out:
// the app keeps asking by itself, and the button asks right now.
export default function ReconnectNotice({ onRetry }) {
  return (
    <div style={{ padding: '1.5rem', display: 'grid', gap: '1rem', justifyItems: 'start' }}>
      <p role="status" style={{ margin: 0 }}>
        Can&apos;t reach Cut right now. You&apos;re still signed in. Trying again...
      </p>
      <Button variant="secondary" onClick={onRetry}>
        Try now
      </Button>
    </div>
  );
}
