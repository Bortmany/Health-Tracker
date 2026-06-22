import { useEffect, useState } from 'react';
import { useActivities } from '../hooks/useActivities.js';
import { useActiveInjuries } from '../hooks/useInjuries.js';
import { useLog, usePutLog } from '../hooks/useLogs.js';
import { useNutrition, usePutNutrition } from '../hooks/useNutrition.js';
import styles from './Log.module.css';

const DURATIONS = [5, 10, 15, 20, 30, 45, 60, 75, 90, 120];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(date, days) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

const METRIC_FIELDS = [
  { key: 'weight', label: 'Weight (kg)', step: '0.1' },
  { key: 'waist', label: 'Waist (cm)', step: '0.1' },
  { key: 'sleep', label: 'Sleep (h)', step: '0.1' },
  { key: 'hrv', label: 'HRV', step: '1' },
  { key: 'recovery', label: 'Recovery %', step: '1' },
  { key: 'strain', label: 'Strain', step: '0.1' },
  { key: 'steps', label: 'Steps', step: '1' },
  { key: 'calories', label: 'Calories', step: '1' },
];

function buildFormFromData(data, nutritionData) {
  return {
    weight: data.log?.weight ?? '',
    foodCalories: nutritionData?.log?.calories ?? '',
    protein: nutritionData?.log?.protein ?? '',
    carbs: nutritionData?.log?.carbs ?? '',
    fat: nutritionData?.log?.fat ?? '',
    meals: (nutritionData?.meals ?? []).map((m, i) => ({
      key: m.id ?? `new-${i}`,
      name: m.name ?? '',
      calories: m.calories ?? '',
      protein: m.protein ?? '',
    })),
    waist: data.log?.waist ?? '',
    sleep: data.log?.sleep ?? '',
    hrv: data.log?.hrv ?? '',
    recovery: data.log?.recovery ?? '',
    strain: data.log?.strain ?? '',
    steps: data.log?.steps ?? '',
    calories: data.log?.calories ?? '',
    notes: data.log?.notes ?? '',
    habits: data.habits.map((h) => ({ habitId: h.habitId, label: h.label, completed: h.completed })),
    activities: data.activities.map((a, i) => ({
      key: a.id ?? `new-${i}`,
      activityId: a.activityId ?? '',
      name: a.name ?? '',
      durationMinutes: a.durationMinutes ?? 30,
    })),
    injuryCheckins: data.injuryCheckins.map((c) => ({
      injuryId: c.injuryId,
      region: c.region,
      painPre: c.painPre ?? '',
      painDuring: c.painDuring ?? '',
      painPost: c.painPost ?? '',
      swelling: Boolean(c.swelling),
      canTrainTomorrow: c.canTrainTomorrow,
    })),
  };
}

export default function Log() {
  const [date, setDate] = useState(todayISO());
  const { data, isLoading } = useLog(date);
  const { data: nutritionData, isLoading: nutritionLoading } = useNutrition(date);
  const { data: activityOptions = [] } = useActivities();
  const putLog = usePutLog(date);
  const putNutrition = usePutNutrition(date);
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (data && nutritionData) setForm(buildFormFromData(data, nutritionData));
  }, [date, data, nutritionData]);

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleHabit(habitId) {
    setForm((f) => ({
      ...f,
      habits: f.habits.map((h) => (h.habitId === habitId ? { ...h, completed: !h.completed } : h)),
    }));
  }

  function addActivityRow() {
    setForm((f) => ({
      ...f,
      activities: [...f.activities, { key: `new-${Date.now()}`, activityId: '', name: '', durationMinutes: 30 }],
    }));
  }

  function updateActivityRow(key, patch) {
    setForm((f) => ({
      ...f,
      activities: f.activities.map((a) => (a.key === key ? { ...a, ...patch } : a)),
    }));
  }

  function removeActivityRow(key) {
    setForm((f) => ({ ...f, activities: f.activities.filter((a) => a.key !== key) }));
  }

  function addMealRow() {
    setForm((f) => ({
      ...f,
      meals: [...f.meals, { key: `new-${Date.now()}`, name: '', calories: '', protein: '' }],
    }));
  }

  function updateMealRow(key, patch) {
    setForm((f) => ({
      ...f,
      meals: f.meals.map((m) => (m.key === key ? { ...m, ...patch } : m)),
    }));
  }

  function removeMealRow(key) {
    setForm((f) => ({ ...f, meals: f.meals.filter((m) => m.key !== key) }));
  }

  function updateInjuryField(injuryId, key, value) {
    setForm((f) => ({
      ...f,
      injuryCheckins: f.injuryCheckins.map((c) => (c.injuryId === injuryId ? { ...c, [key]: value } : c)),
    }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form) return;

    putLog.mutate({
      weight: form.weight === '' ? null : Number(form.weight),
      waist: form.waist === '' ? null : Number(form.waist),
      sleep: form.sleep === '' ? null : Number(form.sleep),
      hrv: form.hrv === '' ? null : Number(form.hrv),
      recovery: form.recovery === '' ? null : Number(form.recovery),
      strain: form.strain === '' ? null : Number(form.strain),
      steps: form.steps === '' ? null : Number(form.steps),
      calories: form.calories === '' ? null : Number(form.calories),
      notes: form.notes || null,
      habits: form.habits.map(({ habitId, completed }) => ({ habitId, completed })),
      activities: form.activities
        .filter((a) => a.activityId || a.name)
        .map((a) => ({
          activityId: a.activityId || null,
          name: a.activityId ? null : a.name || null,
          durationMinutes: Number(a.durationMinutes) || null,
        })),
      injuryCheckins: form.injuryCheckins.map((c) => ({
        injuryId: c.injuryId,
        painPre: c.painPre === '' ? null : Number(c.painPre),
        painDuring: c.painDuring === '' ? null : Number(c.painDuring),
        painPost: c.painPost === '' ? null : Number(c.painPost),
        swelling: c.swelling,
        canTrainTomorrow: c.canTrainTomorrow,
      })),
    });

    putNutrition.mutate({
      calories: form.foodCalories === '' ? null : Number(form.foodCalories),
      protein: form.protein === '' ? null : Number(form.protein),
      carbs: form.carbs === '' ? null : Number(form.carbs),
      fat: form.fat === '' ? null : Number(form.fat),
      meals: form.meals
        .filter((m) => m.name)
        .map((m) => ({
          name: m.name,
          calories: m.calories === '' ? null : Number(m.calories),
          protein: m.protein === '' ? null : Number(m.protein),
        })),
    });
  }

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <div className={styles.dateNav}>
          <button type="button" onClick={() => setDate((d) => shiftDate(d, -1))} aria-label="Previous day">
            ←
          </button>
          <span className={styles.dateLabel}>{formatDateLabel(date)}</span>
          <button type="button" onClick={() => setDate((d) => shiftDate(d, 1))} aria-label="Next day">
            →
          </button>
        </div>
        <button
          className={styles.saveButton}
          onClick={handleSubmit}
          disabled={!form || putLog.isPending || putNutrition.isPending}
          type="button"
        >
          {putLog.isPending || putNutrition.isPending ? 'Saving...' : 'Save'}
        </button>
      </div>

      {putLog.isError && <p className={styles.error}>{putLog.error.message}</p>}
      {putNutrition.isError && <p className={styles.error}>{putNutrition.error.message}</p>}

      {isLoading || nutritionLoading || !form ? (
        <>
          <div className="skeleton" style={{ height: 160, marginBottom: '1rem' }} />
          <div className="skeleton" style={{ height: 120, marginBottom: '1rem' }} />
          <div className="skeleton" style={{ height: 100 }} />
        </>
      ) : (
        <form onSubmit={handleSubmit}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Metrics</h2>
            <div className={styles.metricsGrid}>
              {METRIC_FIELDS.map(({ key, label, step }) => (
                <label className={styles.field} key={key}>
                  <span className={styles.fieldLabel}>{label}</span>
                  <input
                    className={styles.input}
                    type="number"
                    inputMode="decimal"
                    step={step}
                    value={form[key]}
                    onChange={(e) => updateField(key, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Activities</h2>
            {form.activities.map((a) => (
              <div className={styles.activityRow} key={a.key}>
                {a.activityId || activityOptions.length === 0 ? (
                  <select
                    className={styles.select}
                    value={a.activityId}
                    onChange={(e) => updateActivityRow(a.key, { activityId: e.target.value, name: '' })}
                  >
                    <option value="">Custom...</option>
                    {activityOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={styles.input}
                    type="text"
                    placeholder="Activity name"
                    value={a.name}
                    onChange={(e) => updateActivityRow(a.key, { name: e.target.value })}
                  />
                )}
                <select
                  className={styles.select}
                  value={a.durationMinutes}
                  onChange={(e) => updateActivityRow(a.key, { durationMinutes: e.target.value })}
                >
                  {DURATIONS.map((m) => (
                    <option key={m} value={m}>
                      {m}m
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => removeActivityRow(a.key)}
                  aria-label="Remove activity"
                >
                  ✕
                </button>
              </div>
            ))}
            <button type="button" className={styles.addButton} onClick={addActivityRow}>
              + Add activity
            </button>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Nutrition</h2>
            <div className={styles.metricsGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Calories eaten</span>
                <input
                  className={styles.input}
                  type="number"
                  inputMode="decimal"
                  step="1"
                  value={form.foodCalories}
                  onChange={(e) => updateField('foodCalories', e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Protein (g)</span>
                <input
                  className={styles.input}
                  type="number"
                  inputMode="decimal"
                  step="1"
                  value={form.protein}
                  onChange={(e) => updateField('protein', e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Carbs (g)</span>
                <input
                  className={styles.input}
                  type="number"
                  inputMode="decimal"
                  step="1"
                  value={form.carbs}
                  onChange={(e) => updateField('carbs', e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Fat (g)</span>
                <input
                  className={styles.input}
                  type="number"
                  inputMode="decimal"
                  step="1"
                  value={form.fat}
                  onChange={(e) => updateField('fat', e.target.value)}
                />
              </label>
            </div>

            {form.meals.map((m) => (
              <div className={styles.activityRow} key={m.key}>
                <input
                  className={styles.input}
                  type="text"
                  placeholder="Meal name"
                  value={m.name}
                  onChange={(e) => updateMealRow(m.key, { name: e.target.value })}
                />
                <input
                  className={styles.input}
                  type="number"
                  inputMode="decimal"
                  placeholder="kcal"
                  value={m.calories}
                  onChange={(e) => updateMealRow(m.key, { calories: e.target.value })}
                />
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => removeMealRow(m.key)}
                  aria-label="Remove meal"
                >
                  ✕
                </button>
              </div>
            ))}
            <button type="button" className={styles.addButton} onClick={addMealRow}>
              + Add meal
            </button>
          </section>

          {form.habits.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Habits</h2>
              {form.habits.map((h) => (
                <label className={styles.habitRow} key={h.habitId}>
                  <input
                    className={styles.checkbox}
                    type="checkbox"
                    checked={h.completed}
                    onChange={() => toggleHabit(h.habitId)}
                  />
                  {h.label}
                </label>
              ))}
            </section>
          )}

          {form.injuryCheckins.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Injury check-in</h2>
              {form.injuryCheckins.map((c) => (
                <div className={styles.injuryCard} key={c.injuryId}>
                  <div className={styles.injuryRegion}>{c.region}</div>
                  <div className={styles.painGrid}>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Pain pre</span>
                      <input
                        className={styles.input}
                        type="number"
                        min="0"
                        max="10"
                        value={c.painPre}
                        onChange={(e) => updateInjuryField(c.injuryId, 'painPre', e.target.value)}
                      />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>During</span>
                      <input
                        className={styles.input}
                        type="number"
                        min="0"
                        max="10"
                        value={c.painDuring}
                        onChange={(e) => updateInjuryField(c.injuryId, 'painDuring', e.target.value)}
                      />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Post</span>
                      <input
                        className={styles.input}
                        type="number"
                        min="0"
                        max="10"
                        value={c.painPost}
                        onChange={(e) => updateInjuryField(c.injuryId, 'painPost', e.target.value)}
                      />
                    </label>
                  </div>
                  <div className={styles.toggleRow}>
                    <button
                      type="button"
                      className={`${styles.toggleButton} ${c.swelling ? styles.toggleButtonActive : ''}`}
                      onClick={() => updateInjuryField(c.injuryId, 'swelling', !c.swelling)}
                    >
                      Swelling
                    </button>
                    <button
                      type="button"
                      className={`${styles.toggleButton} ${c.canTrainTomorrow ? styles.toggleButtonActive : ''}`}
                      onClick={() => updateInjuryField(c.injuryId, 'canTrainTomorrow', !c.canTrainTomorrow)}
                    >
                      Can train tomorrow
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Notes</h2>
            <textarea
              className={styles.textarea}
              value={form.notes}
              onChange={(e) => updateField('notes', e.target.value)}
            />
          </section>
        </form>
      )}
    </div>
  );
}
