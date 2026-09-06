import { useState } from 'react';
import {
  Button,
  Card,
  Chip,
  ConfirmDialog,
  EmptyState,
  ErrorText,
  Field,
  Screen,
  Skeleton,
  TextArea,
  Toast,
  useToast,
} from '../components/ui/index.js';
import {
  useApproveApplication,
  useCoachApplications,
  useCoaches,
  useDeclineApplication,
  useRevokeCoach,
} from '../hooks/useAdmin.js';
import styles from './AdminCoaches.module.css';

const REASON_MAX = 300;
const SAVE_ERROR = "Couldn't save that — please try again.";

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// One applicant: tap the head to open the details, Approve/Decline inline.
// Each row owns its own requests so "Approving..." and any error stay on
// the row they belong to.
function PendingRow({ application, expanded, onToggle, onDecided }) {
  const approve = useApproveApplication();
  const decline = useDeclineApplication();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');

  const busy = approve.isPending || decline.isPending;
  const failed = approve.isError || decline.isError;

  function handleApprove() {
    approve.mutate(application.id, {
      onSuccess: () => onDecided(`Approved — ${application.displayName} is now a coach.`),
    });
  }

  function handleDecline() {
    decline.mutate(
      { id: application.id, reason: reason.trim() === '' ? undefined : reason.trim() },
      { onSuccess: () => onDecided('Application declined.') }
    );
  }

  function cancelDecline() {
    setDeclining(false);
    setReason('');
    decline.reset();
  }

  return (
    <div className={styles.row}>
      <button type="button" className={styles.rowHead} onClick={onToggle} aria-expanded={expanded}>
        <div className={styles.rowInfo}>
          <div className={styles.rowName}>{application.displayName}</div>
          <div className={styles.rowMeta}>{application.applicantEmail}</div>
        </div>
        <div className={styles.rowRight}>
          <Chip tone="warn">Pending</Chip>
          <span className={styles.chevron}>{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <dl className={styles.details}>
          <dt>Account name</dt>
          <dd>{application.applicantName}</dd>
          <dt>Email</dt>
          <dd>{application.applicantEmail}</dd>
          <dt>Credentials</dt>
          <dd className={styles.preWrap}>{application.credentials}</dd>
          <dt>Years coaching</dt>
          <dd>{application.yearsCoaching}</dd>
          <dt>Training approach</dt>
          <dd className={styles.preWrap}>{application.approach}</dd>
          <dt>Link</dt>
          <dd>
            {application.link ? (
              <a href={application.link} target="_blank" rel="noopener noreferrer" className={styles.link}>
                {application.link}
              </a>
            ) : (
              <span className={styles.rowMeta}>None given</span>
            )}
          </dd>
          <dt>Submitted</dt>
          <dd>{formatDate(application.createdAt)}</dd>
        </dl>
      )}

      {declining ? (
        <div className={styles.declineBox}>
          <Field label="Reason (optional)">
            <TextArea
              placeholder="Optional note for the applicant"
              maxLength={REASON_MAX}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX))}
            />
            <div className={styles.counter}>
              {reason.length}/{REASON_MAX}
            </div>
          </Field>
          <div className={styles.actions}>
            <Button size="sm" onClick={handleDecline} disabled={busy}>
              {decline.isPending ? 'Declining...' : 'Confirm decline'}
            </Button>
            <Button variant="secondary" size="sm" onClick={cancelDecline} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.actions}>
          <Button size="sm" onClick={handleApprove} disabled={busy}>
            {approve.isPending ? 'Approving...' : 'Approve'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setDeclining(true)} disabled={busy}>
            Decline
          </Button>
        </div>
      )}

      {failed && <ErrorText>{SAVE_ERROR}</ErrorText>}
    </div>
  );
}

function CoachRow({ coach, onRevoke, revoking, error }) {
  return (
    <div className={styles.row}>
      <div className={styles.coachHead}>
        <div className={styles.rowInfo}>
          <div className={styles.rowName}>{coach.displayName}</div>
          <div className={styles.rowMeta}>{coach.email}</div>
          <div className={styles.rowMeta}>Coaching since {formatDate(coach.coachingSince)}</div>
        </div>
        <Button variant="danger" size="sm" onClick={onRevoke} disabled={revoking}>
          Revoke
        </Button>
      </div>
      {error && <ErrorText>{SAVE_ERROR}</ErrorText>}
    </div>
  );
}

export default function AdminCoaches() {
  const applications = useCoachApplications('pending');
  const coaches = useCoaches();
  const revoke = useRevokeCoach();
  const toast = useToast();
  const [expandedId, setExpandedId] = useState(null);
  const [coachToRevoke, setCoachToRevoke] = useState(null);
  const [revokeFailedId, setRevokeFailedId] = useState(null);

  const pending = applications.data?.applications ?? [];
  const coachList = coaches.data?.coaches ?? [];

  function handleRevoke() {
    const coach = coachToRevoke;
    setRevokeFailedId(null);
    // Stays open (buttons disabled) until done, so a second tap can't
    // revoke twice; on failure the dialog closes and the row says so.
    revoke.mutate(coach.userId, {
      onSuccess: () => toast.show(`Revoked — ${coach.displayName} is no longer a coach.`),
      onError: () => setRevokeFailedId(coach.userId),
      onSettled: () => setCoachToRevoke(null),
    });
  }

  return (
    <Screen title="Coach applications">
      <Card className={styles.stackCard} title="Pending">
        {applications.isLoading ? (
          <Skeleton height="4rem" count={3} />
        ) : applications.isError ? (
          <ErrorText>Couldn&apos;t load applications — please try again.</ErrorText>
        ) : pending.length === 0 ? (
          <EmptyState>No pending applications. Nice and quiet ☕</EmptyState>
        ) : (
          pending.map((application) => (
            <PendingRow
              key={application.id}
              application={application}
              expanded={expandedId === application.id}
              onToggle={() => setExpandedId((id) => (id === application.id ? null : application.id))}
              onDecided={(message) => toast.show(message)}
            />
          ))
        )}
      </Card>

      <Card className={styles.stackCard} title="Current coaches">
        {coaches.isLoading ? (
          <Skeleton height="3rem" count={2} />
        ) : coaches.isError ? (
          <ErrorText>Couldn&apos;t load coaches — please try again.</ErrorText>
        ) : coachList.length === 0 ? (
          <EmptyState>No coaches yet — approve an application above to add your first one.</EmptyState>
        ) : (
          coachList.map((coach) => (
            <CoachRow
              key={coach.userId}
              coach={coach}
              onRevoke={() => setCoachToRevoke(coach)}
              revoking={revoke.isPending}
              error={revokeFailedId === coach.userId}
            />
          ))
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(coachToRevoke)}
        message={
          coachToRevoke
            ? `Revoke ${coachToRevoke.displayName}'s coaching access? Their clients keep all their own logged data and programs — only the coach connection ends.`
            : ''
        }
        confirmLabel="Revoke access"
        busy={revoke.isPending}
        onConfirm={handleRevoke}
        onCancel={() => setCoachToRevoke(null)}
      />

      <Toast message={toast.message} />
    </Screen>
  );
}
