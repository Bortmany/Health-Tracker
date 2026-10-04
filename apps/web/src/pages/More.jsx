import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Chip,
  ConfirmDialog,
  ErrorText,
  Field,
  Input,
  Screen,
  Skeleton,
  Toast,
  useToast,
  Tooltip,
} from '../components/ui/index.js';
import CoachPayStep from '../components/CoachPayStep.jsx';
import UnreadDot from '../components/UnreadDot.jsx';
import UpgradePanel from '../components/UpgradePanel.jsx';
import { useDeleteAccount, useExportData } from '../hooks/useAccount.js';
import { useMe, useLogout } from '../hooks/useAuth.js';
import {
  useAcceptCoachInvite,
  useCancelCoachRequest,
  useDeclineCoachInvite,
  useMyCoach,
  useRedeemCoachCode,
  useRemoveMyCoach,
} from '../hooks/useCoach.js';
import { useMyApplication } from '../hooks/useCoachApplications.js';
import { useCoachBilling } from '../hooks/useCoachBilling.js';
import { useCoachProfile } from '../hooks/useCoachProfile.js';
import { useUnread } from '../hooks/useMessages.js';
import { useSettings, useUpdateSettings } from '../hooks/useSettings.js';
import { firstName } from '../lib/checkin.js';
import { getPaid, pills, pricing as pricingCopy, student as studentCopy, subscription as subscriptionCopy } from '../lib/billingCopy.js';
import { toCalendarDay } from '../lib/localDate.js';
import { THEME_OPTIONS, useTheme } from '../lib/useTheme.js';
import styles from './More.module.css';

const FIELDS = [
  { key: 'startWeight', label: 'Start weight (kg)', step: '0.1' },
  { key: 'targetWeight', label: 'Target weight (kg)', step: '0.1' },
  { key: 'targetDate', label: 'Target date', type: 'date' },
  { key: 'height', label: 'Height (cm)', step: '0.1' },
  { key: 'age', label: 'Age', step: '1' },
  { key: 'stepGoal', label: 'Step goal', step: '1' },
  { key: 'sleepGoal', label: 'Sleep goal (h)', step: '0.1' },
];

function buildForm(settings) {
  return {
    startWeight: settings?.startWeight ?? '',
    targetWeight: settings?.targetWeight ?? '',
    targetDate: toCalendarDay(settings?.targetDate) ?? '',
    height: settings?.height ?? '',
    age: settings?.age ?? '',
    stepGoal: settings?.stepGoal ?? '',
    sleepGoal: settings?.sleepGoal ?? '',
  };
}

// Free members see the upgrade card right under the Account card.
function PlanTierLine({ planTier }) {
  if (planTier === 'premium') {
    return (
      <div className={styles.mutedLine}>
        <Link className={styles.inlineLink} to="/account/subscription">
          Premium plan — AI plan on
        </Link>
      </div>
    );
  }
  return <div className={styles.mutedLine}>Free plan</div>;
}

// Light, dark, or follow the phone. Saved on this device only — it isn't
// part of the Save button's settings, so there's nothing to submit.
function AppearanceSection() {
  const { setting, setTheme } = useTheme();

  return (
    <Card className={styles.stackCard} title="Appearance">
      <p className={styles.appearanceNote}>
        How Cut looks on this device. &quot;System&quot; follows your phone or computer.
      </p>
      <div className={styles.segmented} role="group" aria-label="Appearance">
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`${styles.segment} ${setting === option.value ? styles.segmentActive : ''}`.trim()}
            aria-pressed={setting === option.value}
            onClick={() => setTheme(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </Card>
  );
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// A coach asked this student to train with them (from the coach's "Invite
// by email" tool). Accept fires straight away unless the student already
// has a coach — then a confirmation first, since accepting ends that link.
function CoachInviteRow({ invite, currentCoach, onDone }) {
  const accept = useAcceptCoachInvite();
  const decline = useDeclineCoachInvite();
  const [confirming, setConfirming] = useState(false);
  const busy = accept.isPending || decline.isPending;
  const name = invite.coach?.displayName ?? 'A coach';

  function doAccept(replaceCurrent) {
    accept.mutate(
      { id: invite.id, replaceCurrent },
      {
        onSuccess: () => onDone(`You're now training with ${name}`),
        onSettled: () => setConfirming(false),
      }
    );
  }

  function handleAccept() {
    if (currentCoach) setConfirming(true);
    else doAccept(false);
  }

  return (
    <div className={styles.inviteRow}>
      <div className={styles.row}>
        <div className={styles.mutedLine}>Coach {name} invited you to train with them.</div>
        <div className={styles.rowActions}>
          <Button size="sm" onClick={handleAccept} disabled={busy}>
            {accept.isPending ? 'Accepting...' : 'Accept'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => decline.mutate(invite.id, { onSuccess: () => onDone('Invite declined') })}
            disabled={busy}
          >
            {decline.isPending ? 'Declining...' : 'Decline'}
          </Button>
        </div>
      </div>
      {(accept.isError || decline.isError) && <ErrorText>Something went wrong — please try again.</ErrorText>}
      <ConfirmDialog
        open={confirming}
        message={`Accept ${name}'s invite? This will end your coaching relationship with ${currentCoach?.displayName ?? 'your current coach'}.`}
        confirmLabel="Accept invite"
        busy={accept.isPending}
        onConfirm={() => doAccept(true)}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

// The student's "Your coach" card. When more than one state could apply:
// active coach → a coach's invite → the student's own pending request →
// the invite-code form.
function CoachSection({ onToast, payState, setPayState }) {
  // While we wait for the provider to confirm a payment, check every few seconds.
  const { data: link, isLoading, refetch, isFetching } = useMyCoach({
    refetchInterval: payState === 'confirming' ? 5000 : false,
  });
  const { data: unread } = useUnread();
  const navigate = useNavigate();
  const redeemCode = useRedeemCoachCode();
  const removeCoach = useRemoveMyCoach();
  const cancelRequest = useCancelCoachRequest();
  const [code, setCode] = useState('');
  const [success, setSuccess] = useState(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const coach = link?.coach ?? null;
  const pendingRequest = link?.pendingRequest ?? null;
  const coachInvites = link?.coachInvites ?? [];
  const pendingPayment = link?.pendingPayment ?? null;

  // The moment a confirmed payment turns into a coach link, say so once.
  const coachName = coach?.displayName ?? null;
  useEffect(() => {
    if (payState === 'confirming' && coach) {
      onToast(studentCopy.nowTraining(coachName ?? studentCopy.coachFallback));
      setPayState(null);
    }
  }, [payState, coach, coachName, onToast, setPayState]);

  // If a coach we were about to pay disappears without the student doing
  // anything (the coach's access was ended), say so rather than go silent.
  const hadPendingPayment = useRef(false);
  const [coachGone, setCoachGone] = useState(false);
  const studentEndedIt = useRef(false);
  useEffect(() => {
    if (isLoading) return;
    if (pendingPayment) {
      hadPendingPayment.current = true;
      setCoachGone(false);
    } else if (hadPendingPayment.current) {
      hadPendingPayment.current = false;
      if (!coach && payState !== 'confirming' && !studentEndedIt.current) setCoachGone(true);
      studentEndedIt.current = false;
    }
  }, [pendingPayment, coach, isLoading, payState]);

  function handleRedeem(e) {
    e.preventDefault();
    if (!code) return;
    redeemCode.mutate(code, {
      onSuccess: (result) => {
        setSuccess(result.coach?.displayName ?? null);
        setCode('');
      },
    });
  }

  function handleRemove() {
    // The dialog stays open (buttons disabled) until the disconnect is
    // done, so it can't be triggered twice.
    removeCoach.mutate(undefined, {
      onSuccess: () => setSuccess(null),
      onSettled: () => setConfirmingRemove(false),
    });
  }

  function handleCancelRequest() {
    cancelRequest.mutate(pendingRequest.id, { onSuccess: () => onToast('Request cancelled') });
  }

  // "Cancel request" on the pay step: needs the request's id, which the server
  // may send inside pendingPayment or alongside it as pendingRequest.
  const payRequestId = pendingPayment?.requestId ?? pendingRequest?.id ?? null;
  function handleCancelPayment() {
    studentEndedIt.current = true;
    cancelRequest.mutate(payRequestId, { onSuccess: () => onToast(studentCopy.cancelledToast) });
  }

  // A coach's invite is shown even when the student already has a coach —
  // accepting it then asks for confirmation, since it ends the current link.
  const inviteRows = coachInvites.map((invite) => (
    <CoachInviteRow key={invite.id} invite={invite} currentCoach={coach} onDone={onToast} />
  ));

  let body;
  if (isLoading) {
    body = <Skeleton height={60} />;
  } else if (coach) {
    body = (
      <>
        <div className={styles.coachRow}>
          <div className={styles.coachName}>Coached by {coach.displayName}</div>
          <span className={`${styles.dotAnchor} ${styles.coachMessage}`}>
            <Button size="sm" block onClick={() => navigate('/messages')}>
              Message {firstName(coach.displayName)}
            </Button>
            {unread && <UnreadDot corner />}
          </span>
          <span className={styles.coachRemove}>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setConfirmingRemove(true)}
              disabled={removeCoach.isPending}
            >
              Remove coach
            </Button>
          </span>
          <ConfirmDialog
            open={confirmingRemove}
            message="Disconnect from your coach? They'll lose access to your logs."
            confirmLabel="Disconnect"
            busy={removeCoach.isPending}
            onConfirm={handleRemove}
            onCancel={() => setConfirmingRemove(false)}
          />
        </div>
        {inviteRows.length > 0 && <div className={styles.inviteBlock}>{inviteRows}</div>}
      </>
    );
  } else if (coachInvites.length > 0) {
    body = inviteRows;
  } else if (pendingPayment) {
    body = (
      <CoachPayStep
        pendingPayment={pendingPayment}
        payState={payState}
        onCheckAgain={() => refetch()}
        checkingAgain={isFetching}
        onNotNow={() => onToast(studentCopy.notNowToast(pendingPayment.coach.displayName ?? studentCopy.coachFallback))}
        onCancel={payRequestId ? handleCancelPayment : undefined}
        cancelling={cancelRequest.isPending}
        cancelError={cancelRequest.isError}
      />
    );
  } else if (pendingRequest) {
    body = (
      <div>
        <div className={styles.row}>
          <div className={styles.mutedLine}>
            Request sent to {pendingRequest.coach?.displayName ?? 'your coach'}
          </div>
          <Button variant="secondary" size="sm" onClick={handleCancelRequest} disabled={cancelRequest.isPending}>
            {cancelRequest.isPending ? 'Cancelling...' : 'Cancel'}
          </Button>
        </div>
        {cancelRequest.isError && <ErrorText>Couldn&apos;t cancel that — please try again.</ErrorText>}
      </div>
    );
  } else {
    body = (
      <form onSubmit={handleRedeem}>
        {coachGone && <p className={styles.mutedLine}>{studentCopy.gone}</p>}
        {success && <p className={styles.mutedLine}>Connected with {success}.</p>}
        <div className={styles.connectRow}>
          {/* The label stays visible; the greyed example only shows the
              shape of a code, and disappears as soon as one is typed. */}
          <div className={styles.connectField}>
            <Field label="Invite code">
              <Input
                type="text"
                placeholder="K7xM2pQ9tR"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
          </div>
          <Button type="submit" disabled={redeemCode.isPending}>
            {redeemCode.isPending ? 'Connecting...' : 'Connect'}
          </Button>
        </div>
        {redeemCode.isError && <ErrorText>{redeemCode.error.message}</ErrorText>}
        <div className={`${styles.row} ${styles.findCoachRow}`}>
          <div className={styles.mutedLine}>Don&apos;t have a code?</div>
          <Link className={styles.linkAsButton} to="/coaches">
            Find a coach
          </Link>
        </div>
      </form>
    );
  }

  return (
    <Card className={styles.stackCard} title="Your coach">
      {pendingPayment && !coach && coachInvites.length === 0 && (
        <div className={styles.payChip}>
          <Chip tone="warn">{pills.waitingForPayment}</Chip>
        </div>
      )}
      {body}
    </Card>
  );
}

// The coach's own card in the same slot: is the profile public, are they
// taking clients, and the door to the editor. The link always renders,
// even if the status can't load, so the editor is always reachable.
function CoachProfileRow() {
  const { data: profile, isLoading, isError } = useCoachProfile();
  const billing = useCoachBilling();

  let status;
  if (isLoading) {
    status = <Skeleton height={40} />;
  } else if (isError || !profile) {
    status = <div className={styles.mutedLine}>Couldn&apos;t load your profile status</div>;
  } else {
    status = (
      <div className={styles.profileStatus}>
        <div>
          {profile.isPublic ? <Chip tone="accent">Public</Chip> : <Chip>Not public yet</Chip>}
        </div>
        <div className={styles.mutedLine}>
          {profile.acceptingClients ? 'Accepting clients' : 'Not accepting new clients'}
        </div>
        {billing.data && !billing.data.revoked && (
          <div className={styles.paymentsLine}>
            <span className={styles.mutedLine}>{getPaid.moreRowLabel}:</span>
            {billing.data.active ? (
              <Chip tone="accent">{getPaid.moreRowActive}</Chip>
            ) : (
              <Tooltip text={getPaid.moreRowLink} describe>
                <Link to="/coach/profile#get-paid" className={styles.chipLink}>
                  <Chip tone="warn">{getPaid.moreRowSetup}</Chip>
                </Link>
              </Tooltip>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className={styles.stackCard} title="Your coach profile">
      <div className={styles.row}>
        <div className={styles.accountInfo}>{status}</div>
        <Link className={styles.linkAsButton} to="/coach/profile">
          Edit profile
        </Link>
      </div>
    </Card>
  );
}

// The one door into applying to coach. Only rendered for non-coaches; shows
// nothing while the application status is still loading (no skeleton — the
// rest of the page already covers loading, and a brief gap beats a jump).
function CoachApplicationRow() {
  const { data, isLoading, isError } = useMyApplication();
  if (isLoading || isError) return null;

  const application = data?.application ?? null;
  const canReapply = data?.canReapply ?? false;
  const status = application?.status;

  if (status === 'pending') {
    return (
      <Card className={styles.stackCard} title="Coaching">
        <Link className={styles.rowLink} to="/coach-application/status">
          <div className={styles.row}>
            <div className={styles.mutedLine}>Your coach application is under review.</div>
            <Chip tone="warn">Pending</Chip>
          </div>
        </Link>
      </Card>
    );
  }

  if (status === 'declined') {
    return (
      <Card className={styles.stackCard} title="Coaching">
        {canReapply ? (
          <div className={styles.row}>
            <div className={styles.mutedLine}>Your last application wasn&apos;t approved.</div>
            <Link className={styles.linkAsButton} to="/coach-application">
              Apply again
            </Link>
          </div>
        ) : (
          <div className={styles.mutedLine}>
            Your application wasn&apos;t approved. Contact us if you&apos;d like to discuss it.
          </div>
        )}
      </Card>
    );
  }

  // No application on file (or an old approved one whose coach access has
  // since been revoked) — only offer the door if the server allows it.
  if (application && !canReapply) return null;

  return (
    <Card className={styles.stackCard} title="Coaching">
      <div className={styles.row}>
        <div className={styles.mutedLine}>Want to coach clients in Cut?</div>
        <Link className={styles.linkAsButton} to="/coach-application">
          Become a coach
        </Link>
      </div>
    </Card>
  );
}

function DataSection() {
  const exportData = useExportData();
  const deleteAccount = useDeleteAccount();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');

  function handleDelete(e) {
    e.preventDefault();
    deleteAccount.mutate(
      { password },
      { onSuccess: () => navigate('/login', { replace: true }) }
    );
  }

  function handleCancel() {
    setConfirming(false);
    setPassword('');
    setConfirmText('');
    deleteAccount.reset();
  }

  return (
    <Card className={styles.stackCard} title="Your data">
      <div className={styles.row}>
        <div className={styles.mutedLine}>Download a copy of everything you&apos;ve logged, as one file. It lists your photos (date and whether shared) but not the image files themselves; to get copies of the files, contact us (details on the Privacy page).</div>
        <Button variant="secondary" onClick={() => exportData.mutate()} disabled={exportData.isPending}>
          {exportData.isPending ? 'Preparing...' : 'Download my data'}
        </Button>
      </div>
      {exportData.isError && <ErrorText>{exportData.error.message}</ErrorText>}

      <div className={styles.dangerBlock}>
        {!confirming ? (
          <div className={styles.row}>
            <div className={styles.mutedLine}>Permanently erase your account and everything in it.</div>
            <Button variant="danger" onClick={() => setConfirming(true)}>
              Delete my account
            </Button>
          </div>
        ) : (
          <form onSubmit={handleDelete} className={styles.deleteForm}>
            <p className={styles.mutedLine}>
              This permanently deletes your account and every log, program, and record in it.
              It cannot be undone — download your data first if you want to keep a copy.
            </p>
            <Field label="Your password">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>
            <Field label="Type DELETE to confirm">
              <Input type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} required />
            </Field>
            {deleteAccount.isError && <ErrorText>{deleteAccount.error.message}</ErrorText>}
            <div className={styles.deleteActions}>
              <Button type="button" variant="secondary" onClick={handleCancel}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="danger"
                disabled={confirmText !== 'DELETE' || !password || deleteAccount.isPending}
              >
                {deleteAccount.isPending ? 'Deleting...' : 'Delete forever'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}

export default function More() {
  const { data: user } = useMe();
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const logout = useLogout();
  const [form, setForm] = useState(buildForm(settings));
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const showToast = toast.show;

  // Another page (e.g. withdrawing a coach application) can send us here
  // with a one-off message to show; it's cleared so Back doesn't repeat it.
  useEffect(() => {
    const message = location.state?.toast;
    if (message) {
      showToast(message);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate, showToast]);

  // Coming back from checkout: refresh the account so a new Premium label or
  // coach shows up without a manual reload. `?paid=1` (paid a coach) starts
  // the "confirming your payment" wait; `?paid=0` means nothing was taken.
  // The address is cleaned so Back doesn't repeat any of it.
  const [payState, setPayState] = useState(null);
  useEffect(() => {
    const paid = searchParams.get('paid');
    if (searchParams.get('upgraded') || paid != null) {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['billingStatus'] });
      queryClient.invalidateQueries({ queryKey: ['myCoach'] });
      if (paid === '1') setPayState('confirming');
      else if (paid === '0') setPayState('cancelled');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, queryClient]);

  useEffect(() => {
    if (settings) setForm(buildForm(settings));
  }, [settings]);

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    updateSettings.mutate(
      {
        startWeight: form.startWeight === '' ? null : Number(form.startWeight),
        targetWeight: form.targetWeight === '' ? null : Number(form.targetWeight),
        targetDate: form.targetDate || null,
        height: form.height === '' ? null : Number(form.height),
        age: form.age === '' ? null : Number(form.age),
        stepGoal: form.stepGoal === '' ? null : Number(form.stepGoal),
        sleepGoal: form.sleepGoal === '' ? null : Number(form.sleepGoal),
      },
      { onSuccess: () => toast.show('Saved') }
    );
  }

  return (
    <Screen
      title="More"
      actions={
        <Button onClick={handleSubmit} disabled={isLoading || updateSettings.isPending}>
          {updateSettings.isPending ? 'Saving...' : 'Save'}
        </Button>
      }
    >
      {updateSettings.isError && <ErrorText>{updateSettings.error.message}</ErrorText>}

      <Card className={styles.stackCard} title="Account">
        <div className={styles.row}>
          <div className={styles.accountInfo}>
            <div>{user?.displayName}</div>
            <div className={styles.mutedLine}>{user?.email}</div>
            <PlanTierLine planTier={user?.planTier} />
            {user?.role === 'coach' && <div className={styles.mutedLine}>Coach account</div>}
          </div>
          <Button variant="secondary" onClick={() => logout.mutate()} disabled={logout.isPending}>
            {logout.isPending ? 'Logging out...' : 'Log out'}
          </Button>
        </div>
        <div className={styles.manageRow}>
          <Link className={styles.inlineLink} to="/account/subscription">
            {subscriptionCopy.manageLink}
          </Link>
        </div>
      </Card>

      {user && user.planTier !== 'premium' && <UpgradePanel />}

      <AppearanceSection />

      {user?.role === 'coach' && <CoachProfileRow />}
      {user?.role !== 'coach' && <CoachSection onToast={showToast} payState={payState} setPayState={setPayState} />}
      {user?.role !== 'coach' && <CoachApplicationRow />}

      <Card className={styles.stackCard} title="Training quiz">
        <div className={styles.row}>
          <div className={styles.mutedLine}>Your answers shape which workout plans we recommend.</div>
          <Link className={styles.linkAsButton} to="/onboarding">
            Retake quiz
          </Link>
        </div>
      </Card>

      {isLoading ? (
        <Skeleton height={220} />
      ) : (
        <form onSubmit={handleSubmit}>
          <Card className={styles.stackCard} title="Goals">
            <div className={styles.grid}>
              {FIELDS.map(({ key, label, step, type }) => (
                <Field label={label} key={key}>
                  <Input
                    type={type ?? 'number'}
                    inputMode={type ? undefined : 'decimal'}
                    step={step}
                    value={form[key]}
                    onChange={(e) => updateField(key, e.target.value)}
                  />
                </Field>
              ))}
            </div>
          </Card>
        </form>
      )}

      <DataSection />

      <p className={styles.legalLinks}>
        <Link to="/privacy">Privacy Policy</Link> · <Link to="/terms">Terms of Use</Link> ·{' '}
        <Link to="/refunds">Refunds</Link> · <Link to="/pricing">{pricingCopy.footerPricing}</Link>
      </p>

      <Toast message={toast.message} />
    </Screen>
  );
}
