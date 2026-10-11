import { useMoneySwitch } from '../hooks/useBilling.js';
import { common } from '../lib/billingCopy.js';
import styles from './MoneyButton.module.css';

// The one quiet line under the first money button on a screen while the
// switch is off. Renders nothing while loading or when payments are on.
export default function MoneyOffNote({ children }) {
  const { loading, on } = useMoneySwitch();
  if (loading || on) return null;
  return <p className={styles.note}>{children ?? common.moneyOffNote}</p>;
}
