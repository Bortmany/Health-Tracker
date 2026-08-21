import { useEffect } from 'react';
import { Button, Chip, ErrorText, Skeleton } from './ui/index.js';
import { useBillingStatus, useCheckout } from '../hooks/useBilling.js';
import styles from './UpgradePanel.module.css';

// The two halves of the same story, kept in one file so the wording about
// plan length can only ever be changed in one place:
//   PlanLengthBadge — what you get on a plan card, before you commit.
//   UpgradePanel    — the honest explanation of what Premium adds.

// Small line under a plan: how much of it a free account gets, and a link
// to the Premium explanation. Falls back to nothing if the server didn't
// send the plan-length fields.
export function PlanLengthBadge({ freeWeeks, premiumWeeks, planTier, onSeePremium }) {
  if (!freeWeeks || !premiumWeeks) return null;
  if (planTier === 'premium') {
    return (
      <div className={styles.badgeRow}>
        <Chip tone="accent">Full {premiumWeeks}-week plan</Chip>
      </div>
    );
  }
  return (
    <div className={styles.badgeRow}>
      <Chip>{freeWeeks} weeks free</Chip>
      <button type="button" className={styles.badgeLink} onClick={onSeePremium}>
        full year with Premium
      </button>
    </div>
  );
}

export default function UpgradePanel({ open, onClose, message = null }) {
  const { data: billing, isLoading } = useBillingStatus();
  const checkout = useCheckout();

  // Escape closes it, and the page behind stops scrolling while it's open —
  // same behaviour as the app's confirm dialogs.
  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose?.();
    }
    document.addEventListener('keydown', handleKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-panel-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={styles.title} id="upgrade-panel-title">
          Premium
        </h2>

        {message && <p className={styles.reason}>{message}</p>}

        <p className={styles.copy}>
          Your free account covers the first 4 weeks of any plan — a full training block, yours to
          keep. Premium opens the same plan across a whole year.
        </p>

        <ul className={styles.list}>
          <li>The full 52-week version of your plan, instead of the first 4 weeks.</li>
          <li>The year split into phases, with a plain-English note on what each one is for.</li>
          <li>Everything you already use stays exactly as it is — nothing free is taken away.</li>
        </ul>

        {isLoading ? (
          <Skeleton height="2.75rem" />
        ) : billing?.enabled ? (
          <>
            <p className={styles.priceNote}>You&apos;ll see the price before you pay anything.</p>
            {checkout.isError && <ErrorText>{checkout.error.message}</ErrorText>}
            <Button block onClick={() => checkout.mutate()} disabled={checkout.isPending}>
              {checkout.isPending ? 'Opening checkout...' : 'Upgrade to Premium'}
            </Button>
          </>
        ) : (
          <p className={styles.priceNote}>
            Paid upgrades aren&apos;t switched on yet — the full-year plan will be available soon.
          </p>
        )}

        <Button variant="ghost" block onClick={onClose}>
          Not now
        </Button>
      </div>
    </div>
  );
}
