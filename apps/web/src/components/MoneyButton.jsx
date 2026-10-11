import { Button } from './ui/index.js';
import { useMoneySwitch } from '../hooks/useBilling.js';
import { common } from '../lib/billingCopy.js';
import styles from './MoneyButton.module.css';

// Every button that can charge or move money goes through this one wrapper,
// so none of them can ever be live while the money switch is off.
//
//  - Switch still loading -> a grey bar the button's size (never a flash of
//    an enabled button).
//  - Switch off (or the status call failed) -> a muted "Coming soon" button
//    with the hover hint. It uses aria-disabled so a keyboard can still reach
//    it to read the hint; clicking does nothing.
//  - Switch on -> the real button.
//
// `lockedHint` makes the button inert for another reason (e.g. "Pay the
// startup fee first") with that hint. `payout` reads the payout switch too.
export default function MoneyButton({
  children,
  onClick,
  disabled = false,
  lockedHint,
  payout = false,
  payoutsOn = true,
  offHint = common.moneyOffHint,
  block = false,
  ...rest
}) {
  const { loading, on } = useMoneySwitch();

  if (loading) {
    return <div className={`skeleton ${styles.bar} ${block ? styles.block : ''}`.trim()} aria-hidden="true" />;
  }

  const off = !on || (payout && !payoutsOn);
  if (off) {
    return (
      <Button
        variant={rest.variant ?? 'primary'}
        size={rest.size}
        block={block}
        aria-disabled="true"
        title={payout && on ? common.payoutsOffHint : offHint}
        onClick={undefined}
      >
        {common.comingSoon}
      </Button>
    );
  }

  if (lockedHint) {
    return (
      <Button
        variant={rest.variant ?? 'primary'}
        size={rest.size}
        block={block}
        aria-disabled="true"
        title={lockedHint}
      >
        {children}
      </Button>
    );
  }

  return (
    <Button
      variant={rest.variant ?? 'primary'}
      size={rest.size}
      block={block}
      disabled={disabled}
      title={rest.title}
      onClick={onClick}
      type={rest.type}
    >
      {children}
    </Button>
  );
}
