// Patterns: Ladder https://mobbin.com/screens/a4b92e08-4977-4b90-90a9-d451345b2ce9 · Withings+ https://mobbin.com/screens/e40c2bbd-f27f-462c-94af-c469764e8e77 · Bevel https://mobbin.com/screens/464bafc1-bf69-40aa-b79d-22b9d322bc01
import { useNavigate } from 'react-router-dom';
import { Button, Card, Chip } from './ui/index.js';
import { useMoneySwitch } from '../hooks/useBilling.js';
import { subscription, upgrade } from '../lib/billingCopy.js';
import { monthlyPriceLabel, savingsChipLabel, yearlyPriceLabel } from '../lib/pricing.js';
import styles from './UpgradePanel.module.css';

// One quiet invitation to the AI plan for free members — a card on the page,
// never a popup. Shown on Train (under the plan) and More (under "Free plan").
// Prices come from lib/pricing.js. The button doesn't open checkout itself:
// it takes the member to the one place where monthly or yearly is chosen
// (/account/subscription#plans), so the choice is made in one place.
export default function UpgradePanel() {
  const { loading: isLoading, on, status } = useMoneySwitch();
  const navigate = useNavigate();
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
          <h3 className={styles.title}>{upgrade.title}</h3>
          <ul className={styles.benefits}>
            {subscription.benefits.map((benefit) => (
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
          {on && status.aiPlanEnabled ? (
            <div className={styles.action}>
              <Button
                onClick={() => navigate('/account/subscription#plans')}
                title="Pick monthly or yearly. Cancel any time."
              >
                {upgrade.button}
              </Button>
              <p className={styles.note}>{upgrade.note}</p>
            </div>
          ) : (
            <p className={styles.note}>{upgrade.offNote}</p>
          )}
        </div>
      </div>
    </Card>
  );
}
