import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
  Card,
  Chip,
  ErrorText,
  Field,
  Input,
  Screen,
  SectionTitle,
  Select,
  Skeleton,
  Tooltip,
} from '../components/ui/index.js';
import { useActivities } from '../hooks/useActivities.js';
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

// The three most-logged metrics live in the always-visible quick strip.
const QUICK_FIELDS = [
  { key: 'weight', label: 'Weight (kg)', step: '0.1', inputMode: 'decimal' },
  { key: 'sleep', label: 'Sleep (h)', step: '0.1', inputMode: 'decimal' },
  { key: 'steps', label: 'Steps', step: '1', inputMode: 'numeric' },
];

// Everything else goes in the collapsible "More metrics" group.
const MORE_FIELDS = [
  { key: 'waist', label: 'Waist (cm)', step: '0.1', inputMode: 'decimal' },
  { key: 'hrv', label: 'HRV', step: '1', inputMode: 'numeric' },
  { key: 'recovery', label: 'Recovery %', step: '1', inputMode: 'numeric' },
  { key: 'strain', label: 'Strain', step: '0.1', inputMode: 'decimal' },
  { key: 'calories', label: 'Calories burned', step: '1', inputMode: 'numeric' },
];

// All metric keys "Use yesterday's numbers" is allowed to fill.
const METRIC_KEYS = ['weight', 'waist', 'sleep', 'hrv', 'recovery', 'strain', 'steps', 'calories'];

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

// A collapsible section card: the title row is the expand/collapse tap target.
function Group({ title, open, onToggle, children }) {
  return (
    <Card>
      <button type="button" className={styles.groupHeader} onClick={onToggle} aria-expanded={open}>
        <SectionTitle>{title}</SectionTitle>
        <span className={styles.chevron} aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && <div className={styles.groupBody}>{children}</div>}
    </Card>
  );
}

export default function Log() {
  const [date, setDate] = useState(todayISO());
  const { data, isLoading } = useLog(date);
  const { data: nutritionData, isLoading: nutritionLoading } = useNutrition(date);
  const { data: yesterdayData } = useLog(shiftDate(date, -1));
  const { data: activityOptions = [] } = useActivities();
  const putLog = usePutLog(date);
  const putNutrition = usePutNutrition(date);
  const [form, setForm] = useState(null);
  const [searchParams] = useSearchParams();

  // Which sections are expanded. Defaults re-evaluate when the date changes:
  // a section that already has data for that day starts open.
  const [open, setOpen] = useState({
    nutrition: true,
    metrics: false,
    activities: false,
    habits: true,
    injuries: true,
    notes: false,
  });
  const openInitRef = useRef(null);

  const focusParam = searchParams.get('focus');
  const focusHandledRef = useRef(false);
  const quickRef = useRef(null);
  const nutritionRef = useRef(null);
  const addMealRef = useRef(null);

  useEffect(() => {
    if (data && nutritionData) {
      const built = buildFormFromData(data, nutritionData);
      setForm(built);
      if (openInitRef.current !== date) {
        openInitRef.current = date;
        setOpen({
          nutrition: true,
          metrics: MORE_FIELDS.some(({ key }) => built[key] !== ''),
          activities: built.activities.length > 0,
          habits: true,
          injuries: true,
          notes: false,
        });
      }
    }
  }, [date, data, nutritionData]);

  // Deep-link focus from the Today screen's quick-log chips (/log?focus=...).
  useEffect(() => {
    if (!form || !focusParam || focusHandledRef.current) return;
    focusHandledRef.current = true;
    if (focusParam === 'meal') {
      setOpen((o) => ({ ...o, nutrition: true }));
      setTimeout(() => {
        nutritionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        addMealRef.current?.querySelector('button')?.focus();
      }, 0);
    } else if (QUICK_FIELDS.some(({ key }) => key === focusParam)) {
      window.scrollTo({ top: 0 });
      quickRef.current?.querySelector(`input[name="${focusParam}"]`)?.focus();
    }
  }, [form, focusParam]);

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

  // "Use yesterday's numbers": fills blanks only, never overwrites what's typed —
  // the same fill-blanks rule the device-sync endpoint uses.
  const canFillFromYesterday = Boolean(
    form &&
      yesterdayData?.log &&
      METRIC_KEYS.some((k) => yesterdayData.log[k] != null && form[k] === '')
  );

  function fillFromYesterday() {
    if (!yesterdayData?.log) return;
    setForm((f) => {
      const next = { ...f };
      for (const k of METRIC_KEYS) {
        if (next[k] === '' && yesterdayData.log[k] != null) next[k] = yesterdayData.log[k];
      }
      return next;
    });
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

  const saving = putLog.isPending || putNutrition.isPending;

  return (
    <Screen>
      <div className={styles.header}>
        <div className={styles.dateNav}>
          <Tooltip label="Previous day">
            <button
              type="button"
              className={styles.dateNavButton}
              onClick={() => setDate((d) => shiftDate(d, -1))}
              aria-label="Previous day"
            >
              ←
            </button>
          </Tooltip>
          <span className={styles.dateLabel}>
            {formatDateLabel(date)}
            {date === todayISO() && <Chip tone="accent">Today</Chip>}
          </span>
          <Tooltip label="Next day">
            <button
              type="button"
              className={styles.dateNavButton}
              onClick={() => setDate((d) => shiftDate(d, 1))}
              aria-label="Next day"
            >
              →
            </button>
          </Tooltip>
        </div>
        <Button onClick={handleSubmit} disabled={!form || saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>

      {putLog.isError && <ErrorText>{putLog.error.message}</ErrorText>}
      {putNutrition.isError && <ErrorText>{putNutrition.error.message}</ErrorText>}

      {isLoading || nutritionLoading || !form ? (
        <div className={styles.stack}>
          <Skeleton height={110} />
          <Skeleton height={160} />
          <Skeleton height={56} count={3} />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className={styles.stack}>
          <Card>
            <div className={styles.quickStrip} ref={quickRef}>
              {QUICK_FIELDS.map(({ key, label, step, inputMode }) => (
                <Field label={label} key={key}>
                  <Input
                    type="number"
                    name={key}
                    inputMode={inputMode}
                    step={step}
                    value={form[key]}
                    onChange={(e) => updateField(key, e.target.value)}
                  />
                </Field>
              ))}
            </div>
            {canFillFromYesterday && (
              <div className={styles.yesterdayRow}>
                <Button variant="ghost" size="sm" onClick={fillFromYesterday}>
                  Use yesterday's numbers
                </Button>
              </div>
            )}
          </Card>

          <div ref={nutritionRef}>
            <Group
              title="Nutrition"
              open={open.nutrition}
              onToggle={() => setOpen((o) => ({ ...o, nutrition: !o.nutrition }))}
            >
              <div className={styles.fieldGrid}>
                <Field label="Calories eaten">
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="1"
                    value={form.foodCalories}
                    onChange={(e) => updateField('foodCalories', e.target.value)}
                  />
                </Field>
                <Field label="Protein (g)">
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="1"
                    value={form.protein}
                    onChange={(e) => updateField('protein', e.target.value)}
                  />
                </Field>
                <Field label="Carbs (g)">
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="1"
                    value={form.carbs}
                    onChange={(e) => updateField('carbs', e.target.value)}
                  />
                </Field>
                <Field label="Fat (g)">
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="1"
                    value={form.fat}
                    onChange={(e) => updateField('fat', e.target.value)}
                  />
                </Field>
              </div>

              {form.meals.map((m) => (
                <div className={styles.rowGrid} key={m.key}>
                  <Input
                    type="text"
                    placeholder="Meal name"
                    value={m.name}
                    onChange={(e) => updateMealRow(m.key, { name: e.target.value })}
                  />
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="kcal"
                    value={m.calories}
                    onChange={(e) => updateMealRow(m.key, { calories: e.target.value })}
                  />
                  <Tooltip label="Remove meal">
                    <button
                      type="button"
                      className={styles.removeButton}
                      onClick={() => removeMealRow(m.key)}
                      aria-label="Remove meal"
                    >
                      ✕
                    </button>
                  </Tooltip>
                </div>
              ))}
              <div ref={addMealRef}>
                <Button variant="ghost" size="sm" onClick={addMealRow}>
                  + Add meal
                </Button>
              </div>
            </Group>
          </div>

          <Group
            title="More metrics"
            open={open.metrics}
            onToggle={() => setOpen((o) => ({ ...o, metrics: !o.metrics }))}
          >
            <div className={styles.fieldGrid}>
              {MORE_FIELDS.map(({ key, label, step, inputMode }) => (
                <Field label={label} key={key}>
                  <Input
                    type="number"
                    name={key}
                    inputMode={inputMode}
                    step={step}
                    value={form[key]}
                    onChange={(e) => updateField(key, e.target.value)}
                  />
                </Field>
              ))}
            </div>
          </Group>

          <Group
            title="Activities"
            open={open.activities}
            onToggle={() => setOpen((o) => ({ ...o, activities: !o.activities }))}
          >
            {form.activities.map((a) => (
              <div className={styles.rowGrid} key={a.key}>
                {a.activityId || activityOptions.length === 0 ? (
                  <Select
                    value={a.activityId}
                    onChange={(e) => updateActivityRow(a.key, { activityId: e.target.value, name: '' })}
                  >
                    <option value="">Custom...</option>
                    {activityOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    type="text"
                    placeholder="Activity name"
                    value={a.name}
                    onChange={(e) => updateActivityRow(a.key, { name: e.target.value })}
                  />
                )}
                <Select
                  value={a.durationMinutes}
                  onChange={(e) => updateActivityRow(a.key, { durationMinutes: e.target.value })}
                >
                  {DURATIONS.map((m) => (
                    <option key={m} value={m}>
                      {m}m
                    </option>
                  ))}
                </Select>
                <Tooltip label="Remove activity">
                  <button
                    type="button"
                    className={styles.removeButton}
                    onClick={() => removeActivityRow(a.key)}
                    aria-label="Remove activity"
                  >
                    ✕
                  </button>
                </Tooltip>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={addActivityRow}>
              + Add activity
            </Button>
          </Group>

          {form.habits.length > 0 && (
            <Group
              title="Habits"
              open={open.habits}
              onToggle={() => setOpen((o) => ({ ...o, habits: !o.habits }))}
            >
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
            </Group>
          )}

          {form.injuryCheckins.length > 0 && (
            <Group
              title="Injury check-in"
              open={open.injuries}
              onToggle={() => setOpen((o) => ({ ...o, injuries: !o.injuries }))}
            >
              {form.injuryCheckins.map((c) => (
                <div className={styles.injuryCard} key={c.injuryId}>
                  <div className={styles.injuryRegion}>{c.region}</div>
                  <div className={styles.painGrid}>
                    <Field label="Pain pre">
                      <Input
                        type="number"
                        min="0"
                        max="10"
                        value={c.painPre}
                        onChange={(e) => updateInjuryField(c.injuryId, 'painPre', e.target.value)}
                      />
                    </Field>
                    <Field label="During">
                      <Input
                        type="number"
                        min="0"
                        max="10"
                        value={c.painDuring}
                        onChange={(e) => updateInjuryField(c.injuryId, 'painDuring', e.target.value)}
                      />
                    </Field>
                    <Field label="Post">
                      <Input
                        type="number"
                        min="0"
                        max="10"
                        value={c.painPost}
                        onChange={(e) => updateInjuryField(c.injuryId, 'painPost', e.target.value)}
                      />
                    </Field>
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
            </Group>
          )}

          <Group
            title="Notes"
            open={open.notes}
            onToggle={() => setOpen((o) => ({ ...o, notes: !o.notes }))}
          >
            <textarea
              className={styles.textarea}
              value={form.notes}
              onChange={(e) => updateField('notes', e.target.value)}
            />
          </Group>
        </form>
      )}
    </Screen>
  );
}
