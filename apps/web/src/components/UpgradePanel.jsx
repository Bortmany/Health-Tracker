// Patterns: Ladder https://mobbin.com/screens/a4b92e08-4977-4b90-90a9-d451345b2ce9 · Withings+ https://mobbin.com/screens/e40c2bbd-f27f-462c-94af-c469764e8e77 · Bevel https://mobbin.com/screens/464bafc1-bf69-40aa-b79d-22b9d322bc01
import { Button, Card, Chip, ErrorText } from './ui/index.js';
import { useBillingStatus, useCheckout } from '../hooks/useBilling.js';
import { monthlyPriceLabel, savingsChipLabel, yearlyPriceLabel } from '../lib/pricing.js';
import styles from './UpgradePanel.module.css';

// Short, honest list of what Premium adds — nothing it doesn't do.
const BENEFITS = [
  'An AI plan written from your quiz',
  'Adjusted every week from your workouts, weigh-ins and recovery',
  'Your plan history, week by week',
  'Everything else stays free',
];

// One quiet invitation to Premium for free members — a card on the page,
// never a popup. Shown on Train (under the plan) and More (under "Free plan").
// Prices come from lib/pricing.js; checkout uses the existing billing flow
// (one price in Paddle today, so there's no monthly/yearly picker here).
export default function UpgradePanel() {
  const { data: billing, isLoading } = useBillingStatus();
  const checkout = useCheckout();
  const saveChip = savingsChipLabel();

  if (isLoading) {
    return (
      <Card className={styles.card}>
        <div className={styles.layout} aria-hidden="true">
          <div className={styles.text}>
            <div className="skeleton" style={{ width: '60%', height: '1.25rem' }} />
            <div className="skeleton" style={{ width: '90%', height: '1rem' }} />
            <div className="skeleton" style={{ width: '80%', height: '1rem' }} />
            <div className="skeleton" style={{ width: '70%', height: '1rem' }} />
          </div>
          <div className={styles.side}>
            <div className="skeleton" style={{ width: '50%', height: '1rem' }} />
            <div className="skeleton" style={{ width: '80%', height: '1rem' }} />
            <div className="skeleton" style={{ width: '100%', height: '44px' }} />
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className={styles.card}>
      <div className={styles.layout}>
        <div className={styles.text}>
          <h3 className={styles.title}>Get a plan that adjusts to you every week</h3>
          <ul className={styles.benefits}>
            {BENEFITS.map((benefit) => (
              <li key={benefit} className={styles.benefit}>
                <span className={styles.check} aria-hidden="true">
                  ✓
                </span>
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.side}>
          <div className={styles.prices}>
            <p className={styles.price}>{monthlyPriceLabel()}</p>
            <p className={styles.priceYearly}>
              <span>{yearlyPriceLabel()}</span>
              {saveChip && <Chip tone="accent">{saveChip}</Chip>}
            </p>
          </div>
          <div aria-live="polite">
            {checkout.isError && <ErrorText>{checkout.error.message}</ErrorText>}
          </div>
          {billing?.enabled ? (
            <div className={styles.action}>
              <Button
                onClick={() => checkout.mutate()}
                disabled={checkout.isPending}
                title="Opens secure checkout. Cancel any time."
              >
                {checkout.isPending ? 'Opening checkout...' : 'Upgrade'}
              </Button>
              <p className={styles.note}>Cancel anytime.</p>
            </div>
          ) : (
            <p className={styles.note}>
              Paid upgrades aren&apos;t switched on yet — the AI plan will be available soon.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
