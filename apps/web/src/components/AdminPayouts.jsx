import { useState } from 'react';
import {
  Button,
  Card,
  Chip,
  ConfirmDialog,
  EmptyState,
  ErrorText,
  Input,
  Skeleton,
  Toast,
  useToast,
  Tooltip,
} from './ui/index.js';
import MoneyButton from './MoneyButton.jsx';
import { useAdminEarnings, useAdminPayouts, useResolvePayout, useRunPayouts } from '../hooks/useAdmin.js';
import { useMoneySwitch } from '../hooks/useBilling.js';
import { admin as copy, common, pills } from '../lib/billingCopy.js';
import { owedTone, payButtonState, payoutPill } from '../lib/billingLogic.js';
import { formatCents, formatMoment } from '../lib/money.js';
import styles from './AdminPayouts.module.css';

// The figure block at the end of a coach row: what they're owed and what
// they've been paid. Dashes (never NaN) when the amounts aren't known.
export function MoneyBlock({ money }) {
  if (!money) return null;
  const tone = owedTone(money.owedCents);
  const toneClass = tone === 'accent' ? styles.owedAccent : tone === 'warn' ? styles.owedWarn : '';
  return (
    <div className={styles.moneyBlock}>
      <div className={styles.moneyLabel}>{copy.owed}</div>
      <div className={`${styles.owedFigure} ${toneClass}`.trim()}>{formatCents(money.owedCents)}</div>
      <div className={styles.meta}>{copy.paidSoFar(money.paidCents)}</div>
      {money.beingCheckedCents > 0 && <div className={styles.meta}>{copy.beingChecked(money.beingCheckedCents)}</div>}
    </div>
  );
}

// Top card: the one thing the owner comes here to do. Owner-only screen
// (the page sits inside AdminRoute); the server returns 404 to anyone else.
export function PayoutsSummary() {
  const earnings = useAdminEarnings();
  const history = useAdminPayouts();
  const runPayouts = useRunPayouts();
  const { status } = useMoneySwitch();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [failedNote, setFailedNote] = useState(null);
  const [runFailed, setRunFailed] = useState(false);

  const data = earnings.data;
  const state = payButtonState(status, data);
  const lastPayout = (history.data?.pages ?? []).flatMap((p) => (Array.isArray(p?.payouts) ? p.payouts : []))[0];
  const lastPill = lastPayout ? payoutPill(lastPayout.status) : null;

  function handleSend() {
    setRunFailed(false);
    setFailedNote(null);
    // The dialog stays open with its buttons disabled until the run is done,
    // so a second tap cannot start a second run (the server also locks).
    runPayouts.mutate(undefined, {
      onSuccess: (result) => {
        const started = Number.isInteger(result?.started) ? result.started : 0;
        const failed = Number.isInteger(result?.failed) ? result.failed : 0;
        const total = Number.isInteger(result?.totalCents) ? result.totalCents : 0;
        if (failed > 0) setFailedNote({ failed, total: started + failed });
        if (started > 0) toast.show(copy.startedToast(total, started));
      },
      onError: () => setRunFailed(true),
      onSettled: () => setConfirming(false),
    });
  }

  let content;
  if (earnings.isLoading) {
    content = (
      <div className={styles.summary}>
        <div className="skeleton" style={{ height: 48, width: '60%', maxWidth: 240 }} />
        <div className="skeleton" style={{ height: 44, width: 160 }} />
      </div>
    );
  } else if (earnings.isError) {
    content = (
      <>
        <ErrorText>{copy.loadError}</ErrorText>
        <Button variant="secondary" onClick={() => earnings.refetch()} disabled={earnings.isFetching}>
          {earnings.isFetching ? common.retrying : common.retry}
        </Button>
      </>
    );
  } else {
    const coachCount = data.coaches.filter((c) => !c.revoked || (c.owedCents ?? 0) !== 0).length;
    content = (
      <div className={styles.summary}>
        <div>
          <Tooltip text={copy.owedHint} describe>
            <div className={styles.owedLabel} tabIndex={0}>
              {copy.owedLabel}
            </div>
          </Tooltip>
          <div className={styles.bigFigure}>{formatCents(data.totalOwedCents)}</div>
          <div className={styles.meta}>{copy.owedSub(coachCount)}</div>
        </div>
        <div className={styles.summaryEnd}>
          {state === 'off' && <MoneyButton payout payoutsOn={status.payoutsConfigured} block />}
          {state === 'methodA' && (
            <Button aria-disabled="true" title={copy.methodAHint} block>
              {copy.payButton}
            </Button>
          )}
          {state === 'nothing' && (
            <Button aria-disabled="true" title={copy.nothingHint} block>
              {copy.payButton}
            </Button>
          )}
          {state === 'ready' && (
            <Button onClick={() => setConfirming(true)} disabled={runPayouts.isPending} block>
              {runPayouts.isPending ? 'Sending...' : copy.payButton}
            </Button>
          )}
          {state === 'off' && <p className={styles.meta}>{copy.payoutsOffNote}</p>}
          {state === 'nothing' && <p className={styles.meta}>{copy.allPaidUp}</p>}
          {state === 'methodA' && (
            <p className={styles.meta}>
              {copy.methodALine}
              {lastPill && (
                <>
                  {' '}
                  <Chip tone={lastPill.tone}>{lastPill.label}</Chip>
                </>
              )}
            </p>
          )}
          {runFailed && <ErrorText>{copy.runError}</ErrorText>}
        </div>
      </div>
    );
  }

  const negatives = data?.negativeBalances ?? [];
  const attention = data?.needsAttention ?? [];

  return (
    <>
      <Card className={styles.stackCard} title={copy.payoutsTitle}>
        {content}
      </Card>

      {failedNote && (
        <Card className={`${styles.stackCard} ${styles.warnCard}`}>
          <Chip tone="warn">{pills.headsUp}</Chip> <span>{copy.partialFail(failedNote.failed, failedNote.total)}</span>
        </Card>
      )}

      {attention.length > 0 && (
        <Card className={`${styles.stackCard} ${styles.warnCard}`}>
          <Chip tone="warn">{pills.headsUp}</Chip>{' '}
          <span>Needs your attention:</span>
          {attention.map((item) => (
            <p key={`${item.id}`} className={styles.meta}>
              {item.message}
            </p>
          ))}
        </Card>
      )}

      {negatives.length > 0 && (
        <Card className={`${styles.stackCard} ${styles.warnCard}`}>
          <Chip tone="warn">{pills.headsUp}</Chip>{' '}
          <span>
            {copy.negativeLead(negatives.length)}
            {negatives.map((n, i) => (
              <span key={n.userId}>
                {i > 0 && ', '}
                <a href={`#coach-${n.userId}`} className={styles.link}>
                  {n.displayName}
                </a>{' '}
                ({formatCents(n.owedCents)})
              </span>
            ))}
            .
          </span>
        </Card>
      )}

      <ConfirmDialog
        open={confirming}
        message={copy.confirmSend(data?.payableCents ?? 0, data?.payableCoachCount ?? 0, data?.skippedCoachCount ?? 0)}
        confirmLabel={runPayouts.isPending ? 'Sending...' : copy.sendPayouts}
        cancelLabel={copy.notYet}
        busy={runPayouts.isPending}
        onConfirm={handleSend}
        onCancel={() => setConfirming(false)}
      />
      <Toast message={toast.message} />
    </>
  );
}

// Buttons for a payout parked for a check: the owner says it was sent or not,
// types a short note, and taps once more to confirm. Nothing changes until then.
function ResolveBox({ payout, onDone }) {
  const resolve = useResolvePayout();
  const [choice, setChoice] = useState(null); // 'paid' | 'failed' | null
  const [note, setNote] = useState('');
  const [needNote, setNeedNote] = useState(false);

  function confirm() {
    const trimmed = note.trim();
    if (!trimmed) {
      setNeedNote(true);
      return;
    }
    resolve.mutate(
      { id: payout.id, outcome: choice, note: trimmed },
      { onSuccess: () => { setChoice(null); setNote(''); onDone(); } }
    );
  }

  if (!choice) {
    return (
      <div className={styles.resolveBox}>
        <p className={styles.meta}>{copy.resolve.hint}</p>
        <div className={styles.resolveButtons}>
          <Button size="sm" variant="secondary" onClick={() => setChoice('paid')}>
            {copy.resolve.sent}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setChoice('failed')}>
            {copy.resolve.notSent}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.resolveBox}>
      <p className={styles.meta}>{choice === 'paid' ? copy.resolve.confirmSent : copy.resolve.confirmNotSent}</p>
      <label className={styles.meta} htmlFor={`resolve-note-${payout.id}`}>
        {copy.resolve.noteLabel}
      </label>
      <Input
        id={`resolve-note-${payout.id}`}
        value={note}
        maxLength={300}
        placeholder={copy.resolve.notePlaceholder}
        aria-invalid={needNote ? 'true' : undefined}
        disabled={resolve.isPending}
        onChange={(e) => { setNote(e.target.value); setNeedNote(false); }}
      />
      {needNote && <ErrorText>{copy.resolve.needNote}</ErrorText>}
      {resolve.isError && <ErrorText>{copy.resolve.error}</ErrorText>}
      <div className={styles.resolveButtons}>
        <Button size="sm" onClick={confirm} disabled={resolve.isPending}>
          {resolve.isPending ? copy.resolve.saving : copy.resolve.confirm}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setChoice(null); setNeedNote(false); }} disabled={resolve.isPending}>
          {copy.resolve.cancel}
        </Button>
      </div>
    </div>
  );
}

// What has gone out, newest first, twenty at a time.
export function PayoutHistoryCard() {
  const history = useAdminPayouts();
  const toast = useToast();
  const rows = (history.data?.pages ?? []).flatMap((p) => (Array.isArray(p?.payouts) ? p.payouts : []));

  function copyRef(ref) {
    navigator.clipboard?.writeText(ref).then(
      () => toast.show(copy.refCopied),
      () => {}
    );
  }

  let content;
  if (history.isLoading) {
    content = <Skeleton height="3rem" count={5} />;
  } else if (history.isError) {
    content = (
      <>
        <ErrorText>{copy.historyError}</ErrorText>
        <Button variant="secondary" onClick={() => history.refetch()} disabled={history.isFetching}>
          {history.isFetching ? common.retrying : common.retry}
        </Button>
      </>
    );
  } else if (rows.length === 0) {
    content = <EmptyState>{copy.historyEmpty}</EmptyState>;
  } else {
    content = (
      <>
        {rows.map((payout, i) => {
          const pill = payoutPill(payout?.status);
          const ref = typeof payout?.providerRef === 'string' ? payout.providerRef : '';
          return (
            <div key={payout?.id ?? i} className={styles.historyRow}>
              <div className={styles.historyLine}>
                <div className={styles.historyInfo}>
                  <div className={styles.name}>{payout?.coach?.displayName ?? '—'}</div>
                  <div className={styles.meta}>{formatMoment(payout?.createdAt)}</div>
                </div>
                <div className={styles.historyEnd}>
                  <span className={styles.amount}>{formatCents(payout?.amountCents)}</span>
                  <Chip tone={pill.tone}>{pill.label}</Chip>
                </div>
              </div>
              {payout?.status === 'manual_review' && payout?.id && (
                <ResolveBox payout={payout} onDone={() => toast.show(copy.resolve.done)} />
              )}
              {ref && (
                <Tooltip text={copy.refHint} describe>
                  <button type="button" className={styles.refButton} onClick={() => copyRef(ref)}>
                    {ref}
                  </button>
                </Tooltip>
              )}
            </div>
          );
        })}
        {history.hasNextPage && (
          <Button variant="ghost" onClick={() => history.fetchNextPage()} disabled={history.isFetchingNextPage}>
            {history.isFetchingNextPage ? common.loading : common.showMore}
          </Button>
        )}
      </>
    );
  }

  return (
    <Card className={styles.stackCard} title={copy.historyTitle}>
      {content}
      <Toast message={toast.message} />
    </Card>
  );
}
