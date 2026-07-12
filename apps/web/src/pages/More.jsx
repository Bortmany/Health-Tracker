import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, ErrorText, Field, Input, Screen, Skeleton } from '../components/ui/index.js';
import { useMe, useLogout } from '../hooks/useAuth.js';
import { useBillingStatus, useCheckout } from '../hooks/useBilling.js';
import { useMyCoach, useRedeemCoachCode, useRemoveMyCoach } from '../hooks/useCoach.js';
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

function CoachSection() {
  const { data: coach, isLoading } = useMyCoach();
  const redeemCode = useRedeemCoachCode();
  const removeCoach = useRemoveMyCoach();
  const [code, setCode] = useState('');
  const [success, setSuccess] = useState(null);

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
    if (window.confirm('Disconnect from your coach?')) {
      removeCoach.mutate(undefined, { onSuccess: () => setSuccess(null) });
    }
  }

  return (
    <Card className={styles.stackCard} title="Your coach">
      {isLoading ? (
        <Skeleton height={60} />
      ) : coach ? (
        <div className={styles.row}>
          <div>Coached by {coach.displayName}</div>
          <Button variant="danger" size="sm" onClick={handleRemove} disabled={removeCoach.isPending}>
            Remove coach
          </Button>
        </div>
      ) : (
        <form onSubmit={handleRedeem}>
          {success && <p className={styles.mutedLine}>Connected with {success}.</p>}
          <div className={styles.connectRow}>
            <Input type="text" placeholder="Invite code" value={code} onChange={(e) => setCode(e.target.value)} />
            <Button type="submit" disabled={redeemCode.isPending}>
              {redeemCode.isPending ? 'Connecting...' : 'Connect'}
            </Button>
          </div>
          {redeemCode.isError && <ErrorText>{redeemCode.error.message}</ErrorText>}
        </form>
      )}
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
  const queryClient = useQueryClient();

  // Coming back from a successful Stripe checkout: refresh the account so
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
    updateSettings.mutate({
      startWeight: form.startWeight === '' ? null : Number(form.startWeight),
      targetWeight: form.targetWeight === '' ? null : Number(form.targetWeight),
      targetDate: form.targetDate || null,
      height: form.height === '' ? null : Number(form.height),
      age: form.age === '' ? null : Number(form.age),
      stepGoal: form.stepGoal === '' ? null : Number(form.stepGoal),
      sleepGoal: form.sleepGoal === '' ? null : Number(form.sleepGoal),
    });
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

      {user?.role !== 'coach' && <CoachSection />}

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
    </Screen>
  );
}
