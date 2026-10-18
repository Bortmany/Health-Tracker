import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Chip, ConfirmDialog, EmptyState, ErrorText, Screen, Skeleton, Toast, useToast } from '../components/ui/index.js';
import { useDebtHolds, useSettleDebtHold } from '../hooks/useAdmin.js';
import { entriesText } from '../lib/debtHolds.js';
import styles from './AdminDebtHolds.module.css';

const SAVE_ERROR = "Couldn't mark that settled — please try again.";

function HoldRow({ hold, onSettle, settling, failed }) {
  return (
    <div className={`${styles.row} ${hold.settled ? styles.muted : ''}`}>
      <div>
        <div className={styles.amount}>{hold.amountText}</div>
        <div className={styles.meta}>
          Since {hold.sinceText} · {entriesText(hold.entries)}
          {hold.settled && ` · Settled ${hold.settledText}`}
        </div>
        {failed && <ErrorText>{SAVE_ERROR}</ErrorText>}
      </div>
      {hold.settled ? (
        <Chip>Settled</Chip>
      ) : (
        <>
          <Chip tone="warn">Open</Chip>
          <Button size="sm" onClick={onSettle} disabled={settling}>
            Mark settled
          </Button>
        </>
      )}
    </div>
  );
}

export default function AdminDebtHolds() {
  const holds = useDebtHolds();
  const settle = useSettleDebtHold();
  const toast = useToast();
  const [target, setTarget] = useState(null);
  const [failedId, setFailedId] = useState(null);

  const open = holds.data?.open ?? [];
  const settled = holds.data?.settled ?? [];

  function handleConfirm() {
    const hold = target;
    setFailedId(null);
    settle.mutate(hold.id, {
      onSuccess: () => toast.show('Marked settled — that email can register again.'),
      onError: () => setFailedId(hold.id),
      onSettled: () => setTarget(null),
    });
  }

  return (
    <Screen title="Coach debt holds" width={720}>
      <p className={styles.intro}>
        When a coach who owed Cut money deleted their account, their email was blocked from registering again. These
        are those blocks. <Link to="/admin/coaches" className={styles.link}>Back to coaches</Link>
      </p>

      <Card className={styles.stackCard} title="Open">
        {holds.isLoading ? (
          <Skeleton height="4rem" count={2} />
        ) : holds.isError ? (
          <>
            <ErrorText>Couldn&apos;t load the holds — please try again.</ErrorText>
            <Button className={styles.retry} variant="secondary" size="sm" onClick={() => holds.refetch()}>
              Try again
            </Button>
          </>
        ) : open.length === 0 ? (
          <EmptyState>No coaches owe Cut money</EmptyState>
        ) : (
          open.map((hold) => (
            <HoldRow
              key={hold.id}
              hold={hold}
              onSettle={() => setTarget(hold)}
              settling={settle.isPending}
              failed={failedId === hold.id}
            />
          ))
        )}
      </Card>

      {settled.length > 0 && (
        <Card className={styles.stackCard}>
          <details>
            <summary className={styles.summary}>Settled ({settled.length})</summary>
            {settled.map((hold) => (
              <HoldRow key={hold.id} hold={hold} />
            ))}
          </details>
        </Card>
      )}

      <ConfirmDialog
        open={Boolean(target)}
        message={
          target
            ? `Mark the ${target.amountText} hold as settled? This lets that email register again. It does not move any money.`
            : ''
        }
        confirmLabel="Confirm"
        busy={settle.isPending}
        onConfirm={handleConfirm}
        onCancel={() => setTarget(null)}
      />

      <Toast message={toast.message} />
    </Screen>
  );
}
