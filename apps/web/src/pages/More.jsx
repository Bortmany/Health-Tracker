import { useEffect, useState } from 'react';
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
} from '../components/ui/index.js';
import { useDeleteAccount, useExportData } from '../hooks/useAccount.js';
import { useMe, useLogout } from '../hooks/useAuth.js';
import { useBillingStatus, useCheckout } from '../hooks/useBilling.js';
import {
  useAcceptCoachInvite,
  useCancelCoachRequest,
  useDeclineCoachInvite,
  useMyCoach,
  useRedeemCoachCode,
  useRemoveMyCoach,
} from '../hooks/useCoach.js';
import { useMyApplication } from '../hooks/useCoachApplications.js';
import { useCoachProfile } from '../hooks/useCoachProfile.js';
import { useSettings, useUpdateSettings } from '../hooks/useSettings.js';
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
    targetDate: settings?.targetDate ?? '',
    height: settings?.height ?? '',
    age: settings?.age ?? '',
    stepGoal: settings?.stepGoal ?? '',
    sleepGoal: settings?.sleepGoal ?? '',
  };
}

function PlanTierLine({ planTier }) {
  const { data: billing } = useBillingStatus();
  const checkout = useCheckout();

  if (planTier === 'premium') {
    return <div className={styles.mutedLine}>Premium plan</div>;
  }
  if (!billing?.enabled) {
    return <div className={styles.mutedLine}>Free plan — upgrades coming soon</div>;
  }
  return (
    <div className={styles.mutedLine}>
      Free plan{' — '}
      <button
        type="button"
        className={styles.inlineLinkButton}
        onClick={() => checkout.mutate()}
        disabled={checkout.isPending}
      >
        {checkout.isPending ? 'Opening checkout...' : 'Upgrade to Premium'}
      </button>
      {checkout.isError && <span> ({checkout.error.message})</span>}
    </div>
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
function CoachSection({ onToast }) {
  const { data: link, isLoading } = useMyCoach();
  const redeemCode = useRedeemCoachCode();
  const removeCoach = useRemoveMyCoach();
  const cancelRequest = useCancelCoachRequest();
  const [code, setCode] = useState('');
  const [success, setSuccess] = useState(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const coach = link?.coach ?? null;
  const pendingRequest = link?.pendingRequest ?? null;
  const coachInvites = link?.coachInvites ?? [];

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
        <div className={styles.row}>
          <div>Coached by {coach.displayName}</div>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setConfirmingRemove(true)}
            disabled={removeCoach.isPending}
          >
            Remove coach
          </Button>
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
      {body}
    </Card>
  );
}

// The coach's own card in the same slot: is the profile public, are they
// taking clients, and the door to the editor. The link always renders,
// even if the status can't load, so the editor is always reachable.
function CoachProfileRow() {
  const { data: profile, isLoading, isError } = useCoachProfile();

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
        <div className={styles.mutedLine}>Download a copy of everything you&apos;ve logged, as one file.</div>
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

  // Coming back from a successful Paddle checkout: refresh the account so
  // the Premium label shows up without a manual reload.
  useEffect(() => {
    if (searchParams.get('upgraded')) {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['billingStatus'] });
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
      </Card>

      {user?.role === 'coach' && <CoachProfileRow />}
      {user?.role !== 'coach' && <CoachSection onToast={showToast} />}
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
        <Link to="/refunds">Refunds</Link>
      </p>

      <Toast message={toast.message} />
    </Screen>
  );
}
