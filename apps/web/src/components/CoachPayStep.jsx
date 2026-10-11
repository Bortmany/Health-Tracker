import { Button, ErrorText, Skeleton } from './ui/index.js';
import MoneyButton from './MoneyButton.jsx';
import MoneyOffNote from './MoneyOffNote.jsx';
import { useCoachCheckout } from '../hooks/useBilling.js';
import { common, student } from '../lib/billingCopy.js';
import { billingErrorMessage } from '../lib/billingLogic.js';
import { firstName } from '../lib/checkin.js';
import styles from './CoachPayStep.module.css';

// The student's "pay to start" step inside More's "Your coach" card: a coach
// has accepted them and one tap opens the provider's checkout. The price
// shown is whatever the server returned this moment.
//
// `payState`: 'confirming' (just came back from paying; waiting for the
// provider to confirm), 'cancelled' (came back without paying), or null.
export default function CoachPayStep({
  pendingPayment,
  payState,
  onCheckAgain,
  checkingAgain,
  onNotNow,
  onCancel,
  cancelling,
  cancelError,
}) {
  const checkout = useCoachCheckout();
  const name = pendingPayment.coach.displayName ?? student.coachFallback;
  const first = pendingPayment.coach.displayName ? firstName(pendingPayment.coach.displayName) : name;
  const hasPrice = Number.isInteger(pendingPayment.priceCents);

  if (payState === 'confirming') {
    return (
      <div className={styles.wrap}>
        <p className={styles.line} aria-live="polite">
          {student.confirming}
        </p>
        <div className={styles.bars} aria-hidden="true">
          <Skeleton height="1rem" width="80%" />
          <Skeleton height="1rem" width="55%" />
        </div>
        <Button variant="ghost" size="sm" onClick={onCheckAgain} disabled={checkingAgain}>
          {checkingAgain ? common.loading : student.checkAgain}
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.accepted}>{student.accepted(name)}</p>
      {payState === 'cancelled' && <p className={styles.line}>{student.noPayment}</p>}
      <div className={styles.priceRow}>
        <div>
          <div className={styles.price}>{hasPrice ? student.perMonth(pendingPayment.priceCents) : '—'}</div>
          <div className={styles.line}>{student.billedLine}</div>
        </div>
        <div className={styles.pay}>
          <MoneyButton
            onClick={() => checkout.mutate(pendingPayment.coach.id)}
            disabled={checkout.isPending || !hasPrice}
            block
          >
            {checkout.isPending
              ? common.checkoutOpening
              : hasPrice
                ? student.payButton(pendingPayment.priceCents, first)
                : common.checkoutOpening}
          </MoneyButton>
        </div>
      </div>
      <MoneyOffNote>{student.offNote(name)}</MoneyOffNote>
      {checkout.isError && <ErrorText>{billingErrorMessage(checkout.error, common.checkoutError)}</ErrorText>}
      <div className={styles.secondary}>
        <Button variant="ghost" size="sm" onClick={onNotNow}>
          {student.notNow}
        </Button>
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={cancelling}>
            {cancelling ? student.cancelling : student.cancelRequest}
          </Button>
        )}
      </div>
      {cancelError && <ErrorText>{student.cancelError}</ErrorText>}
    </div>
  );
}
