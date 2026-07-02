import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMe, useLogout } from '../hooks/useAuth.js';
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

export default function More() {
  const { data: user } = useMe();
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const logout = useLogout();
  const [form, setForm] = useState(buildForm(settings));

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
            <div className={styles.accountLabel}>
              {user?.planTier === 'premium' ? 'Premium plan' : 'Free plan — upgrades coming soon'}
            </div>
          </div>
          <button className={styles.logoutButton} onClick={() => logout.mutate()} disabled={logout.isPending} type="button">
            {logout.isPending ? 'Logging out...' : 'Log out'}
          </button>
        </div>
      </section>

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
