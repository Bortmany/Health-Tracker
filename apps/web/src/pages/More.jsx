import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
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
    return <div className={styles.accountLabel}>Premium plan</div>;
  }
  if (!billing?.enabled) {
    return <div className={styles.accountLabel}>Free plan — upgrades coming soon</div>;
  }
  return (
    <div className={styles.accountLabel}>
      Free plan{' — '}
      <button
        type="button"
        onClick={() => checkout.mutate()}
        disabled={checkout.isPending}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--accent)',
          cursor: 'pointer',
          padding: 0,
          font: 'inherit',
        }}
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
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Your coach</h2>
      {isLoading ? (
        <div className="skeleton" style={{ height: 60 }} />
      ) : coach ? (
        <div className={styles.accountRow}>
          <div>Coached by {coach.displayName}</div>
          <button className={styles.logoutButton} onClick={handleRemove} disabled={removeCoach.isPending} type="button">
            Remove coach
          </button>
        </div>
      ) : (
        <form onSubmit={handleRedeem}>
          {success && <p className={styles.accountLabel}>Connected with {success}.</p>}
          {redeemCode.isError && <p className={styles.error}>{redeemCode.error.message}</p>}
          <div className={styles.accountRow}>
            <input
              className={styles.input}
              type="text"
              placeholder="Invite code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              style={{ marginRight: '0.75rem' }}
            />
            <button className={styles.logoutButton} type="submit" disabled={redeemCode.isPending}>
              {redeemCode.isPending ? 'Connecting...' : 'Connect'}
            </button>
          </div>
        </form>
      )}
    </section>
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
    <div className={styles.screen}>
      <div className={styles.header}>
        <h1>More</h1>
        <button className={styles.saveButton} onClick={handleSubmit} disabled={isLoading || updateSettings.isPending} type="button">
          {updateSettings.isPending ? 'Saving...' : 'Save'}
        </button>
      </div>

      {updateSettings.isError && <p className={styles.error}>{updateSettings.error.message}</p>}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Account</h2>
        <div className={styles.accountRow}>
          <div>
            <div>{user?.displayName}</div>
            <div className={styles.accountLabel}>{user?.email}</div>
            <PlanTierLine planTier={user?.planTier} />
            {user?.role === 'coach' && <div className={styles.accountLabel}>Coach account</div>}
          </div>
          <button className={styles.logoutButton} onClick={() => logout.mutate()} disabled={logout.isPending} type="button">
            {logout.isPending ? 'Logging out...' : 'Log out'}
          </button>
        </div>
      </section>

      {user?.role !== 'coach' && <CoachSection />}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Training quiz</h2>
        <div className={styles.accountRow}>
          <div className={styles.accountLabel}>Your answers shape which workout plans we recommend.</div>
          <Link className={styles.logoutButton} to="/onboarding" style={{ textDecoration: 'none' }}>
            Retake quiz
          </Link>
        </div>
      </section>

      {isLoading ? (
        <div className="skeleton" style={{ height: 220 }} />
      ) : (
        <form onSubmit={handleSubmit}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Goals</h2>
            <div className={styles.grid}>
              {FIELDS.map(({ key, label, step, type }) => (
                <label className={styles.field} key={key}>
                  <span className={styles.fieldLabel}>{label}</span>
                  <input
                    className={styles.input}
                    type={type ?? 'number'}
                    inputMode={type ? undefined : 'decimal'}
                    step={step}
                    value={form[key]}
                    onChange={(e) => updateField(key, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </section>
        </form>
      )}
    </div>
  );
}
