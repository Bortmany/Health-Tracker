import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Chip,
  ConfirmDialog,
  EmptyState,
  ErrorText,
  Screen,
  Skeleton,
} from '../components/ui/index.js';
import { useMyApplication, useWithdrawApplication } from '../hooks/useCoachApplications.js';
import styles from './CoachApplicationStatus.module.css';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function PendingCard({ application }) {
  const navigate = useNavigate();
  const withdraw = useWithdrawApplication();
  const [confirming, setConfirming] = useState(false);

  function handleWithdraw() {
    // The dialog stays open (buttons disabled) until the withdrawal is done,
    // so it can't be triggered twice. The "withdrawn" message shows on More.
    withdraw.mutate(application.id, {
      onSuccess: () => navigate('/more', { state: { toast: 'Application withdrawn' } }),
      onSettled: () => setConfirming(false),
    });
  }

  return (
    <Card>
      <div className={styles.stack}>
        <div>
          <Chip tone="warn">Pending review</Chip>
        </div>
        <div className={styles.mutedLine}>Submitted {formatDate(application.createdAt)}</div>
        <p className={styles.body}>We&apos;ll let you know as soon as it&apos;s reviewed — thanks for your patience!</p>
        <div>
          <Button variant="danger" size="sm" onClick={() => setConfirming(true)} disabled={withdraw.isPending}>
            Withdraw application
          </Button>
        </div>
        {withdraw.isError && <ErrorText>Couldn&apos;t withdraw that — please try again.</ErrorText>}
      </div>
      <ConfirmDialog
        open={confirming}
        message="Withdraw your application? You can start a new one right away."
        confirmLabel="Withdraw"
        busy={withdraw.isPending}
        onConfirm={handleWithdraw}
        onCancel={() => setConfirming(false)}
      />
    </Card>
  );
}

function ApprovedCard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // The account may still be cached as a consumer — refresh it so the
  // Clients tab appears in the nav without a reload.
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
  }, [queryClient]);

  return (
    <Card>
      <div className={styles.stack}>
        <div>
          <Chip tone="accent">Approved</Chip>
        </div>
        <p className={styles.body}>You&apos;re a coach! Head to your new Clients tab to invite your first one.</p>
        <div>
          <Button onClick={() => navigate('/clients')}>Go to Clients</Button>
        </div>
      </div>
    </Card>
  );
}

function DeclinedCard({ application, canReapply }) {
  const navigate = useNavigate();
  return (
    <Card>
      <div className={styles.stack}>
        <div>
          <Chip>Not approved this time</Chip>
        </div>
        {application.decisionReason ? (
          <blockquote className={styles.note}>
            <div className={styles.noteLabel}>Note from the owner:</div>
            <p className={styles.noteText}>{application.decisionReason}</p>
          </blockquote>
        ) : (
          <p className={styles.mutedLine}>No specific reason was given.</p>
        )}
        {canReapply ? (
          <div>
            <Button onClick={() => navigate('/coach-application')}>Apply again</Button>
          </div>
        ) : (
          <p className={styles.mutedLine}>
            You&apos;ve used your one reapply. Contact us if you&apos;d like to discuss it further.
          </p>
        )}
      </div>
    </Card>
  );
}

export default function CoachApplicationStatus() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch, isFetching } = useMyApplication();

  let content;
  if (isLoading) {
    content = <Skeleton height={160} />;
  } else if (isError) {
    content = (
      <Card>
        <ErrorText>Couldn&apos;t load your application — please try again.</ErrorText>
        <Button variant="secondary" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Retrying...' : 'Retry'}
        </Button>
      </Card>
    );
  } else if (!data?.application) {
    content = (
      <EmptyState action={<Button onClick={() => navigate('/coach-application')}>Become a coach</Button>}>
        You haven&apos;t applied to coach yet.
      </EmptyState>
    );
  } else if (data.application.status === 'pending') {
    content = <PendingCard application={data.application} />;
  } else if (data.application.status === 'approved') {
    content = <ApprovedCard />;
  } else {
    content = <DeclinedCard application={data.application} canReapply={Boolean(data.canReapply)} />;
  }

  return (
    <Screen
      title="Your application"
      label={
        <Link className={styles.backLink} to="/more">
          ← Back
        </Link>
      }
    >
      {content}
    </Screen>
  );
}
