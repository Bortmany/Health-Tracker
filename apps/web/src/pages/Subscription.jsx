import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Button,
  Card,
  Chip,
  ConfirmDialog,
  EmptyState,
  ErrorText,
  Screen,
  Skeleton,
  Toast,
  useToast,
} from '../components/ui/index.js';
import ChoiceTiles from '../components/ChoiceTiles.jsx';
import ContactEmail from '../components/ContactEmail.jsx';
import MoneyButton from '../components/MoneyButton.jsx';
import MoneyOffNote from '../components/MoneyOffNote.jsx';
import { useAiCheckout, useCancelSubscription, useMoneySwitch, useSubscriptions } from '../hooks/useBilling.js';
import { common, subscription as copy } from '../lib/billingCopy.js';
import {
  billingErrorMessage,
  cancelMessage,
  isAiSubscription,
  priceFigure,
  showAiPicker,
  statusChip,
  statusSentence,
  subscriptionState,
  subscriptionTitle,
} from '../lib/billingLogic.js';
import { formatCents, formatDay } from '../lib/money.js';
import styles from './Subscription.module.css';

// One running (or ending) subscription: what it is, what it costs, when it
// renews, and a two-step cancel (tap, then confirm).
function SubscriptionCard({ sub, onToast }) {
  const cancel = useCancelSubscription();
  const [confirming, setConfirming] = useState(false);
  const state = subscriptionState(sub);
  const chip = statusChip(sub);
  const figure = priceFigure(sub);
  const day = formatDay(sub.periodEnd);

  function handleCancel() {
    // The dialog stays open (buttons disabled) until the cancel is done, so a
    // second tap can't cancel twice.
    cancel.mutate(sub.id, {
      onSuccess: () => onToast(copy.cancelledToast(day)),
      onSettled: () => setConfirming(false),
    });
  }

  return (
    <Card className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>{subscriptionTitle(sub)}</h2>
        <Chip tone={chip.tone}>{chip.label}</Chip>
      </div>
      <div className={styles.cardBody}>
        <dl className={styles.facts}>
          {state !== 'ending' && (
            <>
              <dt>{copy.nextCharge}</dt>
              <dd>{formatDay(sub.periodEnd)}</dd>
            </>
          )}
          <dt>{copy.started}</dt>
          <dd>{formatDay(sub.startedOn)}</dd>
          <dt>{copy.status}</dt>
          <dd>{statusSentence(sub)}</dd>
        </dl>
        <div className={styles.side}>
          <div className={styles.figure}>
            <span className={styles.amount}>{formatCents(figure.cents)}</span>
            <span className={styles.per}>{figure.per}</span>
            {figure.note && <span className={styles.per}>{figure.note}</span>}
          </div>
          {state === 'ending' ? (
            <p className={styles.note}>{copy.restartNote(day)}</p>
          ) : (
            <Button
              variant="danger"
              onClick={() => setConfirming(true)}
              disabled={cancel.isPending}
              title={copy.cancelHint}
            >
              {copy.cancelButton}
            </Button>
          )}
        </div>
      </div>
      {cancel.isError && (
        <div>
          <ErrorText>{billingErrorMessage(cancel.error, copy.cancelError)}</ErrorText>
          <p className={styles.note}>
            <ContactEmail />
          </p>
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        message={cancelMessage(sub)}
        confirmLabel={cancel.isPending ? copy.cancellingBusy : copy.confirmCancel}
        cancelLabel={copy.keepPlan}
        busy={cancel.isPending}
        onConfirm={handleCancel}
        onCancel={() => setConfirming(false)}
      />
    </Card>
  );
}

// A subscription that has finished: a quiet muted card with a way back in.
function EndedCard({ sub }) {
  const title = copy.endedTitle(subscriptionTitle(sub), formatDay(sub.periodEnd));
  return (
    <Card className={`${styles.card} ${styles.muted}`}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>{title}</h2>
      </div>
      {isAiSubscription(sub) ? (
        <a className={styles.linkButton} href="#plans">
          {copy.subscribeAgain}
        </a>
      ) : (
        <Link className={styles.linkButton} to="/coaches">
          {copy.subscribeAgain}
        </Link>
      )}
    </Card>
  );
}

// Monthly or yearly, then one button. Yearly starts selected (the better deal).
function AiPlanPicker({ aiPlanEnabled }) {
  const [interval, setInterval] = useState('year');
  const checkout = useAiCheckout();
  const yearly = interval === 'year';

  const options = [
    { value: 'month', title: copy.monthlyTile, price: copy.monthlyPrice },
    {
      value: 'year',
      title: copy.yearlyTile,
      price: copy.yearlyPrice,
      detail: copy.yearlyDetail,
      chip: copy.saveChip ? <Chip tone="accent">{copy.saveChip}</Chip> : null,
    },
  ];

  return (
    <div id="plans" className={styles.anchor}>
      <Card className={styles.card} title={copy.pickerTitle}>
        <ul className={styles.benefits}>
          {copy.benefits.map((benefit) => (
            <li key={benefit}>
              <span className={styles.tick} aria-hidden="true">
                ✓
              </span>
              <span>{benefit}</span>
            </li>
          ))}
        </ul>
        <ChoiceTiles legend={copy.pickerTitle} name="ai-interval" value={interval} onChange={setInterval} options={options} />
        <div className={styles.subscribe}>
          {aiPlanEnabled ? (
            <MoneyButton onClick={() => checkout.mutate(interval)} disabled={checkout.isPending}>
              {checkout.isPending ? common.checkoutOpening : yearly ? copy.subscribeYearly : copy.subscribeMonthly}
            </MoneyButton>
          ) : (
            <Button aria-disabled="true" title={common.moneyOffHint}>
              {common.comingSoon}
            </Button>
          )}
          {checkout.isError && <ErrorText>{billingErrorMessage(checkout.error, common.checkoutError)}</ErrorText>}
          <MoneyOffNote />
          <p className={styles.note}>{copy.pickerNote}</p>
        </div>
      </Card>
    </div>
  );
}

function SubscriptionSkeleton() {
  return (
    <Card className={styles.card}>
      <div className={styles.skeletons} aria-hidden="true">
        <Skeleton width="40%" height="1.25rem" />
        <Skeleton width="30%" height="2rem" />
        <Skeleton width="70%" height="1rem" />
        <Skeleton width="60%" height="1rem" />
        <Skeleton width="65%" height="1rem" />
        <Skeleton width="9rem" height="44px" />
      </div>
    </Card>
  );
}

export default function Subscription() {
  const subs = useSubscriptions();
  const { loading: switchLoading, on, status } = useMoneySwitch();
  const toast = useToast();
  const location = useLocation();
  const list = subs.data ?? [];
  const running = list.filter((s) => s.status !== 'ended');
  const ended = list.filter((s) => s.status === 'ended');
  const picker = showAiPicker(list, status.planTier);
  const loading = subs.isLoading || switchLoading;

  // "/account/subscription#plans" (from the upgrade card and /pricing) lands
  // on the picker once the page has its content.
  useEffect(() => {
    if (!loading && location.hash === '#plans') {
      document.getElementById('plans')?.scrollIntoView({ block: 'start' });
    }
  }, [loading, location.hash]);

  let content;
  if (loading) {
    content = <SubscriptionSkeleton />;
  } else if (subs.isError) {
    content = (
      <Card className={styles.card}>
        <ErrorText>{copy.loadError}</ErrorText>
        <Button variant="secondary" onClick={() => subs.refetch()} disabled={subs.isFetching}>
          {subs.isFetching ? common.retrying : common.retry}
        </Button>
      </Card>
    );
  } else {
    const nothingToShow = running.length === 0 && !(picker && on) && status.planTier !== 'premium';
    content = (
      <>
        {running.map((sub) => (
          <SubscriptionCard key={sub.id} sub={sub} onToast={toast.show} />
        ))}
        {status.planTier === 'premium' && !running.some(isAiSubscription) && (
          <Card className={styles.card}>
            <p className={styles.note}>{copy.premiumOn}</p>
          </Card>
        )}
        {picker && on && <AiPlanPicker aiPlanEnabled={status.aiPlanEnabled} />}
        {ended.map((sub) => (
          <EndedCard key={sub.id} sub={sub} />
        ))}
        {nothingToShow && (
          <EmptyState
            action={
              <Link className={styles.linkButton} to="/pricing">
                {copy.seeAiPlan}
              </Link>
            }
          >
            {copy.emptyFree}
          </EmptyState>
        )}
      </>
    );
  }

  return (
    <Screen
      width={880}
      title={copy.pageTitle}
      label={
        <Link className={styles.backLink} to="/more">
          {common.back}
        </Link>
      }
    >
      <div className={styles.stack}>{content}</div>
      <Toast message={toast.message} />
    </Screen>
  );
}
