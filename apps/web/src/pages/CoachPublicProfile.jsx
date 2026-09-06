import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  Avatar,
  Button,
  Card,
  Chip,
  ConfirmDialog,
  ErrorText,
  Screen,
  Skeleton,
  Toast,
  useToast,
} from '../components/ui/index.js';
import { useMe } from '../hooks/useAuth.js';
import {
  useCancelCoachRequest,
  useMyCoach,
  useRemoveMyCoach,
  useRequestCoach,
} from '../hooks/useCoach.js';
import { useCoachProfile } from '../hooks/useCoachProfile.js';
import { usePublicCoach, useReferralCoach } from '../hooks/useCoachDirectory.js';
import { specialtyLabel } from '../lib/specialties.js';
import NotFound from './NotFound.jsx';
import styles from './CoachPublicProfile.module.css';

const NOT_ACCEPTING = 'Not taking new clients right now';
const PARTIAL_FAILURE = "Couldn't send the request — please try again from this page";
const GENERIC_ERROR = 'Something went wrong — please try again.';

// What a signed-in student can do on this page, worked out from their own
// coach link. Exactly one of these shows at a time.
function StudentActions({ coach, link }) {
  const requestCoach = useRequestCoach();
  const cancelRequest = useCancelCoachRequest();
  const removeCoach = useRemoveMyCoach();
  const toast = useToast();
  // 'request' (switch a pending request) | 'coach' (switch an active coach) | null
  const [confirming, setConfirming] = useState(null);
  const [switchError, setSwitchError] = useState(null);

  const name = coach.displayName;
  const activeCoach = link.coach;
  const pending = link.pendingRequest;
  const isMyCoach = activeCoach?.slug === coach.slug;
  const pendingHere = pending?.coach?.slug === coach.slug;

  function sendRequest() {
    setSwitchError(null);
    requestCoach.mutate(coach.slug, { onSuccess: () => toast.show(`Request sent to ${name}`) });
  }

  function cancelPending() {
    cancelRequest.mutate(pending.id, { onSuccess: () => toast.show('Request cancelled') });
  }

  // Two calls, in order: undo the old relationship, then ask for the new
  // one. If the second fails after the first succeeded, the page refetches
  // and shows the plain "Request [Name]" button so they can try again.
  async function handleSwitch() {
    const mode = confirming;
    setSwitchError(null);
    try {
      if (mode === 'coach') await removeCoach.mutateAsync();
      else await cancelRequest.mutateAsync(pending.id);
    } catch {
      setSwitchError(GENERIC_ERROR);
      setConfirming(null);
      return;
    }
    try {
      await requestCoach.mutateAsync(coach.slug);
      toast.show(mode === 'coach' ? `You're now requesting ${name}.` : `Request sent to ${name}`);
    } catch {
      setSwitchError(PARTIAL_FAILURE);
    } finally {
      setConfirming(null);
    }
  }

  const busy = requestCoach.isPending || cancelRequest.isPending || removeCoach.isPending;

  let action;
  if (isMyCoach) {
    action = (
      <div>
        <Chip tone="accent">Your coach</Chip>
      </div>
    );
  } else if (pendingHere) {
    action = (
      <div className={styles.statusRow}>
        <Chip tone="warn">Request sent</Chip>
        <Button variant="secondary" size="sm" onClick={cancelPending} disabled={busy}>
          {cancelRequest.isPending ? 'Cancelling...' : 'Cancel'}
        </Button>
      </div>
    );
  } else if (!coach.acceptingClients) {
    action = (
      <Button block disabled>
        {NOT_ACCEPTING}
      </Button>
    );
  } else if (activeCoach) {
    action = (
      <Button variant="secondary" block onClick={() => setConfirming('coach')} disabled={busy}>
        Switch to {name}
      </Button>
    );
  } else if (pending) {
    action = (
      <Button variant="secondary" block onClick={() => setConfirming('request')} disabled={busy}>
        Switch your request to {name}
      </Button>
    );
  } else {
    action = (
      <Button block onClick={sendRequest} disabled={busy}>
        {requestCoach.isPending ? 'Requesting...' : `Request ${name}`}
      </Button>
    );
  }

  const plainError =
    !switchError && (requestCoach.isError || cancelRequest.isError)
      ? requestCoach.error?.message || cancelRequest.error?.message || GENERIC_ERROR
      : null;

  return (
    <div className={styles.actionBlock}>
      {action}
      {switchError && <ErrorText>{switchError}</ErrorText>}
      {plainError && <ErrorText>{plainError}</ErrorText>}
      <ConfirmDialog
        open={confirming !== null}
        message={
          confirming === 'coach'
            ? `Switch to ${name}? This will end your coaching relationship with ${activeCoach?.displayName ?? 'your current coach'} first.`
            : `Cancel your request to ${pending?.coach?.displayName ?? 'your current coach'} and request ${name} instead?`
        }
        confirmLabel={confirming === 'coach' ? 'Switch coaches' : 'Switch request'}
        busy={busy}
        onConfirm={handleSwitch}
        onCancel={() => setConfirming(null)}
      />
      <Toast message={toast.message} />
    </div>
  );
}

function LoggedOutActions({ coach, referralCode }) {
  const loginTo = `/login?next=${encodeURIComponent(`/coach/${coach.slug}`)}`;
  // The referral code rides along into sign-up so no invite code is needed.
  const registerTo = referralCode ? `/register?ref=${encodeURIComponent(referralCode)}` : '/register';
  return (
    <div className={styles.actionBlock}>
      {coach.acceptingClients ? (
        <Link className={styles.primaryLink} to={registerTo}>
          Train with {coach.displayName}
        </Link>
      ) : (
        <Button block disabled>
          {NOT_ACCEPTING}
        </Button>
      )}
      <p className={styles.mutedLine}>
        Already have an account? <Link to={loginTo}>Log in</Link>
      </p>
    </div>
  );
}

// A coach who hasn't gone public yet can still share their referral link.
// Their page 404s, but the code itself resolves — so instead of "Page not
// found" the visitor gets a minimal invite with the same next steps.
function ReferralOnlyPage({ slug, referralCode, user }) {
  const lookup = useReferralCoach(referralCode);
  if (lookup.isLoading) {
    return (
      <Screen>
        <div className={styles.stack}>
          <Skeleton height={80} />
          <Skeleton height={200} />
        </div>
      </Screen>
    );
  }
  const coach = lookup.data;
  if (!coach) return <NotFound />;

  const loginTo = `/login?next=${encodeURIComponent(`/coach/${slug}?ref=${referralCode}`)}`;
  return (
    <Screen title={coach.displayName}>
      <div className={styles.header}>
        <Avatar name={coach.displayName} size={64} />
        <div className={styles.headerText}>
          <div className={styles.headline}>Invited by Coach {coach.displayName}</div>
        </div>
      </div>
      <div className={styles.actionBlock}>
        {user ? (
          <p className={styles.mutedLine}>
            This coach&apos;s page isn&apos;t public yet. Ask them for an invite code and enter it under More.
          </p>
        ) : (
          <>
            <Link className={styles.primaryLink} to={`/register?ref=${encodeURIComponent(referralCode)}`}>
              Train with {coach.displayName}
            </Link>
            <p className={styles.mutedLine}>
              Already have an account? <Link to={loginTo}>Log in</Link>
            </p>
          </>
        )}
      </div>
    </Screen>
  );
}

export default function CoachPublicProfile() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const { data: user, isLoading: userLoading } = useMe();
  const isCoach = user?.role === 'coach';
  const isStudent = Boolean(user) && !isCoach;

  const coachQuery = usePublicCoach(slug);
  // Only the two who need it fetch it: a student for their link, a coach
  // for their own slug (to know whether this page is theirs).
  const linkQuery = useMyCoach({ enabled: isStudent });
  const ownProfile = useCoachProfile({ enabled: isCoach });

  const coach = coachQuery.data;
  const notFound = coachQuery.isError && coachQuery.error?.status === 404;
  const waitingOnViewer = userLoading || (isStudent && linkQuery.isLoading) || (isCoach && ownProfile.isLoading);

  const urlRef = (searchParams.get('ref') ?? '').trim() || null;

  if (notFound) {
    if (urlRef && !userLoading) return <ReferralOnlyPage slug={slug} referralCode={urlRef} user={user} />;
    if (!urlRef) return <NotFound />;
  }

  const isOwnPage = isCoach && ownProfile.data?.slug === slug;
  const backTo = isOwnPage ? '/coach/profile' : '/coaches';
  // The coach's own code wins once the profile has loaded; the one in the
  // URL is only the fallback (it's what the private-coach case runs on).
  const referralCode = coach?.referralCode ?? urlRef;

  let label;
  if (user) {
    label = (
      <Link className={styles.headerLink} to={backTo}>
        ← Back
      </Link>
    );
  } else {
    label = (
      <Link className={styles.headerLink} to={`/login?next=${encodeURIComponent(`/coach/${slug}`)}`}>
        Log in
      </Link>
    );
  }

  if (coachQuery.isLoading || waitingOnViewer) {
    return (
      <Screen label={label}>
        <div className={styles.stack}>
          <Skeleton height={80} />
          <Skeleton height={200} />
        </div>
      </Screen>
    );
  }

  if (coachQuery.isError || !coach) {
    return (
      <Screen title="Coach" label={label}>
        <Card>
          <div className={styles.stack}>
            <ErrorText>Couldn&apos;t load this coach — please try again.</ErrorText>
            <div>
              <Button variant="secondary" onClick={() => coachQuery.refetch()} disabled={coachQuery.isFetching}>
                {coachQuery.isFetching ? 'Retrying...' : 'Retry'}
              </Button>
            </div>
          </div>
        </Card>
      </Screen>
    );
  }

  let action = null;
  if (isOwnPage) {
    action = (
      <div className={styles.actionBlock}>
        <Link className={styles.secondaryLink} to="/coach/profile">
          Edit profile
        </Link>
      </div>
    );
  } else if (!user) {
    action = <LoggedOutActions coach={coach} referralCode={referralCode} />;
  } else if (isStudent && linkQuery.data) {
    action = <StudentActions coach={coach} link={linkQuery.data} />;
  } else if (isStudent && linkQuery.isError) {
    action = (
      <div className={styles.actionBlock}>
        <ErrorText>Couldn&apos;t check your coach status — please reload the page.</ErrorText>
      </div>
    );
  }
  // A coach viewing someone else's page gets no action at all this phase.

  const years = coach.yearsCoaching;

  return (
    <Screen title={coach.displayName} label={label}>
      <div className={styles.header}>
        <Avatar name={coach.displayName} size={64} />
        <div className={styles.headerText}>
          {coach.headline && <div className={styles.headline}>{coach.headline}</div>}
          {coach.acceptingClients && (
            <div>
              <Chip tone="accent">Accepting clients</Chip>
            </div>
          )}
        </div>
      </div>

      {action}

      <Card>
        <div className={styles.stack}>
          {coach.bio && <p className={styles.bio}>{coach.bio}</p>}
          {coach.specialties?.length > 0 && (
            <div className={styles.chipRow}>
              {coach.specialties.map((code) => (
                <Chip key={code}>{specialtyLabel(code)}</Chip>
              ))}
            </div>
          )}
          {(years != null || coach.credentials) && (
            <div className={styles.mutedLine}>
              {years != null && (
                <span>
                  {years} year{years === 1 ? '' : 's'} coaching
                </span>
              )}
              {years != null && coach.credentials && ' · '}
              {coach.credentials && <span>{coach.credentials}</span>}
            </div>
          )}
          {coach.link && (
            <a href={coach.link} target="_blank" rel="noopener noreferrer" className={styles.externalLink}>
              {coach.link}
            </a>
          )}
        </div>
      </Card>
    </Screen>
  );
}
