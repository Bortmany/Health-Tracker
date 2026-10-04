import { Button, Card, Chip, EmptyState, ErrorText, Skeleton, StatCard } from './ui/index.js';
import { useCoachEarnings, useCoachPayouts } from '../hooks/useCoachBilling.js';
import { common, earnings as copy } from '../lib/billingCopy.js';
import { payoutPill } from '../lib/billingLogic.js';
import { formatCents, formatMoment } from '../lib/money.js';
import styles from './EarningsCard.module.css';

function Figures({ data }) {
  const owed = Number.isInteger(data?.owedCents) ? data.owedCents : null;
  const settledByWhop = data?.settledBy === 'provider';
  return (
    <>
      <div className={styles.figures}>
        <StatCard
          label={copy.thisMonth}
          hint={copy.hints.thisMonth}
          value={formatCents(data?.thisMonthCents)}
          sub={copy.fromStudents(data?.studentsThisMonth)}
        />
        <StatCard label={copy.allTime} hint={copy.hints.allTime} value={formatCents(data?.allTimeCents)} />
        {settledByWhop ? (
          <div className={styles.settled}>
            <div className={styles.settledTitle}>{copy.settledBy}</div>
            <div className={styles.settledLine}>{copy.settledLine}</div>
          </div>
        ) : (
          <StatCard
            label={copy.owed}
            hint={copy.hints.owed}
            value={formatCents(owed)}
            valueTone={owed != null && owed < 0 ? 'warn' : 'accent'}
            sub={owed != null && owed < 0 ? copy.negativeLine : copy.nextPayout}
            subTone={owed != null && owed < 0 ? 'warn' : 'neutral'}
          />
        )}
        <StatCard
          label={copy.paidOut}
          hint={copy.hints.paidOut}
          value={formatCents(data?.paidCents)}
          sub={Number.isInteger(data?.beingCheckedCents) && data.beingCheckedCents > 0 ? copy.beingChecked(data.beingCheckedCents) : undefined}
        />
      </div>
      <p className={styles.explainer}>{copy.explainer}</p>
    </>
  );
}

function PayoutHistory({ onCopyLink }) {
  const payouts = useCoachPayouts();
  const rows = (payouts.data?.pages ?? []).flatMap((page) => (Array.isArray(page?.payouts) ? page.payouts : []));

  let body;
  if (payouts.isLoading) {
    body = (
      <div className={styles.skeletonRows} aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={styles.skeletonRow}>
            <Skeleton width="30%" height="1rem" />
            <Skeleton width="25%" height="1rem" />
          </div>
        ))}
      </div>
    );
  } else if (payouts.isError) {
    body = (
      <>
        <ErrorText>{copy.payoutsError}</ErrorText>
        <Button variant="secondary" onClick={() => payouts.refetch()} disabled={payouts.isFetching}>
          {payouts.isFetching ? common.retrying : common.retry}
        </Button>
      </>
    );
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        action={
          <Button variant="secondary" onClick={onCopyLink}>
            {copy.copyLink}
          </Button>
        }
      >
        {copy.emptyPayouts}
      </EmptyState>
    );
  } else {
    body = (
      <>
        <div className={`${styles.row} ${styles.head}`} aria-hidden="true">
          <span>{copy.colDate}</span>
          <span className={styles.statusCol}>{copy.colStatus}</span>
          <span className={styles.amount}>{copy.colAmount}</span>
        </div>
        <ul className={styles.list}>
          {rows.map((payout, i) => {
            const pill = payoutPill(payout?.status);
            return (
              <li key={payout?.id ?? i} className={styles.row}>
                <span className={styles.date}>{formatMoment(payout?.createdAt)}</span>
                <span className={styles.statusCol}>
                  <Chip tone={pill.tone}>{pill.label}</Chip>
                </span>
                <span className={styles.amount}>{formatCents(payout?.amountCents)}</span>
              </li>
            );
          })}
        </ul>
        {payouts.hasNextPage && (
          <Button variant="ghost" onClick={() => payouts.fetchNextPage()} disabled={payouts.isFetchingNextPage}>
            {payouts.isFetchingNextPage ? common.loading : common.showMore}
          </Button>
        )}
      </>
    );
  }

  return (
    <div className={styles.history}>
      <h3 className={styles.historyTitle}>{copy.historyTitle}</h3>
      {body}
    </div>
  );
}

// The coach's own earnings and payout history. Only ever the signed-in
// coach's figures; nothing here shows a student's card or email.
export default function EarningsCard({ onCopyLink }) {
  const { data, isLoading, isError, refetch, isFetching } = useCoachEarnings();

  let figures;
  if (isLoading) {
    figures = (
      <div className={styles.figures} aria-hidden="true">
        <Skeleton height="6rem" />
        <Skeleton height="6rem" />
        <Skeleton height="6rem" />
        <Skeleton height="6rem" />
      </div>
    );
  } else if (isError) {
    figures = (
      <>
        <ErrorText>{copy.loadError}</ErrorText>
        <Button variant="secondary" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? common.retrying : common.retry}
        </Button>
      </>
    );
  } else {
    figures = <Figures data={data} />;
  }

  return (
    <Card title={copy.title}>
      {figures}
      <PayoutHistory onCopyLink={onCopyLink} />
    </Card>
  );
}
