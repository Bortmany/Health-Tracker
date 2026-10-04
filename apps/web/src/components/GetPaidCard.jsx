import { useEffect, useState } from 'react';
import { Button, Card, Chip, ErrorText, Field, Input, Skeleton } from './ui/index.js';
import MoneyButton from './MoneyButton.jsx';
import MoneyOffNote from './MoneyOffNote.jsx';
import { useCoachBilling, useOnboarding, useSetCoachPrice, useStartupFee } from '../hooks/useCoachBilling.js';
import { getPaid, common, pills } from '../lib/billingCopy.js';
import { billingErrorMessage, getPaidSteps } from '../lib/billingLogic.js';
import { centsToInput, commissionPercent, parsePriceInput } from '../lib/money.js';
import styles from './GetPaidCard.module.css';

// One numbered row of the three steps: a circle (a lime tick once done),
// the title and a muted line, then the action or status. A later step is
// dimmed but still readable.
function StepRow({ number, done, current, title, line, children }) {
  return (
    <li className={`${styles.step} ${!done && !current ? styles.dim : ''}`.trim()}>
      <span className={`${styles.circle} ${done ? styles.circleDone : ''}`.trim()} aria-hidden="true">
        {done ? '✓' : number}
      </span>
      <div className={styles.stepBody}>
        <div className={styles.stepTitle}>{title}</div>
        <div className={styles.stepLine}>{line}</div>
        {children && <div className={styles.stepAction}>{children}</div>}
      </div>
    </li>
  );
}

function PriceForm({ billing, onToast }) {
  const setPrice = useSetCoachPrice();
  const [text, setText] = useState(centsToInput(billing.priceCents));
  const [touched, setTouched] = useState(false);

  // A fresh price from the server (after a save) wins over a stale draft.
  useEffect(() => {
    setText(centsToInput(billing.priceCents));
  }, [billing.priceCents]);

  const parsed = parsePriceInput(text, billing.minPriceCents, billing.maxPriceCents);
  const changed = parsed.error == null && parsed.cents !== billing.priceCents;
  const fieldError = touched && parsed.error ? getPaid.priceErrors[parsed.error] : '';
  const serverError = setPrice.isError ? billingErrorMessage(setPrice.error, getPaid.saveError) : '';
  const rate = commissionPercent(billing.ratePercent, billing.payingStudents);
  const keepLine = parsed.error == null ? getPaid.keepLine(parsed.cents, rate) : null;

  function handleSubmit(e) {
    e.preventDefault();
    setTouched(true);
    if (!changed) return;
    setPrice.mutate(parsed.cents, { onSuccess: () => onToast(getPaid.priceSavedToast(parsed.cents)) });
  }

  return (
    <form className={styles.priceForm} onSubmit={handleSubmit} noValidate>
      <Field label={getPaid.priceLabel} error={fieldError || serverError}>
        <div className={styles.priceBox}>
          <span className={styles.affix} aria-hidden="true">
            {getPaid.pricePrefix}
          </span>
          <Input
            id="coach-price"
            type="text"
            inputMode="decimal"
            placeholder={getPaid.pricePlaceholder}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (setPrice.isError) setPrice.reset();
            }}
            onBlur={() => setTouched(true)}
            aria-invalid={fieldError ? 'true' : undefined}
            autoComplete="off"
          />
          <span className={styles.affix}>{getPaid.priceSuffix}</span>
        </div>
      </Field>
      <p className={styles.helper}>{getPaid.priceHelper}</p>
      {keepLine && (
        <p className={styles.helper} aria-live="polite">
          {keepLine}
        </p>
      )}
      <div>
        <Button type="submit" variant="secondary" disabled={!changed || setPrice.isPending}>
          {setPrice.isPending ? getPaid.saving : getPaid.savePrice}
        </Button>
      </div>
    </form>
  );
}

// The coach's "Get paid" card: the two money steps, whether they can take
// paying students yet, and their monthly price. Lives above "Share your
// profile" on /coach/profile (anchor #get-paid).
export default function GetPaidCard({ onToast }) {
  const { data: billing, isLoading, isError, refetch, isFetching } = useCoachBilling();
  const startupFee = useStartupFee();
  const onboarding = useOnboarding();

  let body;
  if (isLoading) {
    body = (
      <div className={styles.skeletons} aria-hidden="true">
        <Skeleton height="3.5rem" count={3} />
        <Skeleton height="2.75rem" />
      </div>
    );
  } else if (isError || !billing) {
    body = (
      <>
        <ErrorText>{getPaid.loadError}</ErrorText>
        <Button variant="secondary" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? common.retrying : common.retry}
        </Button>
      </>
    );
  } else if (billing.revoked) {
    body = <p className={styles.helper}>{getPaid.revoked}</p>;
  } else {
    const steps = getPaidSteps(billing);
    body = (
      <>
        <p className={styles.intro}>{getPaid.intro}</p>
        <ol className={styles.steps}>
          <StepRow
            number={1}
            done={steps.step1}
            current={steps.current === 1}
            title={getPaid.step1Title}
            line={steps.step1 ? getPaid.step1Done(billing.startupFeePaidOn) : getPaid.step1Line}
          >
            {!steps.step1 && (
              <>
                <MoneyButton
                  onClick={() => startupFee.mutate()}
                  disabled={startupFee.isPending}
                  block
                >
                  {startupFee.isPending ? common.checkoutOpening : getPaid.step1Button}
                </MoneyButton>
                {startupFee.isError && (
                  <ErrorText>{billingErrorMessage(startupFee.error, common.checkoutError)}</ErrorText>
                )}
                <MoneyOffNote />
              </>
            )}
          </StepRow>
          <StepRow
            number={2}
            done={steps.step2}
            current={steps.current === 2}
            title={getPaid.step2Title}
            line={steps.step2 ? getPaid.step2Done : getPaid.step2Line}
          >
            {!steps.step2 && (
              <>
                <MoneyButton
                  variant="secondary"
                  onClick={() => onboarding.mutate()}
                  disabled={onboarding.isPending}
                  lockedHint={steps.step1 ? undefined : getPaid.step2Locked}
                  block
                >
                  {onboarding.isPending ? getPaid.step2Opening : getPaid.step2Button}
                </MoneyButton>
                {onboarding.isError && (
                  <ErrorText>{billingErrorMessage(onboarding.error, common.checkoutError)}</ErrorText>
                )}
              </>
            )}
          </StepRow>
          <StepRow
            number={3}
            done={steps.step3}
            current={steps.current === 3}
            title={getPaid.step3Title}
            line={steps.step3 ? getPaid.step3Done : getPaid.step3Waiting}
          >
            {steps.step3 && <Chip tone="accent">{pills.active}</Chip>}
          </StepRow>
        </ol>
        <PriceForm billing={billing} onToast={onToast} />
      </>
    );
  }

  return (
    <div id="get-paid" className={styles.anchor}>
      <Card title={getPaid.title}>{body}</Card>
    </div>
  );
}
