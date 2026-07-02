import { useEffect, useState } from 'react';
import PlanSection from '../components/PlanSection.jsx';
import { useActivePrograms, useCreateProgram } from '../hooks/usePrograms.js';
import {
  useCreateTrainingLog,
  useExerciseHistory,
  useTrainingLog,
  useTrainingLogs,
  useUpdateTrainingLog,
} from '../hooks/useTrainingLogs.js';
import styles from './Train.module.css';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateLabel(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function blankExercise() {
  return { key: `ex-${Date.now()}-${Math.random()}`, name: '', sets: [blankSet(1)] };
}

function blankSet(setNumber) {
  return { key: `set-${Date.now()}-${Math.random()}`, setNumber, weight: '', reps: '', rpe: '' };
}

function blankForm() {
  return { date: todayISO(), programId: '', programDayId: '', notes: '', exercises: [blankExercise()] };
}

function buildFormFromTrainingLog(log) {
  return {
    date: log.date.slice(0, 10),
    programId: log.programId ?? '',
    programDayId: log.programDayId ?? '',
    notes: log.notes ?? '',
    exercises: log.exercises.length
      ? log.exercises.map((ex) => ({
          key: ex.id,
          name: ex.name,
          sets: ex.sets.map((s) => ({
            key: s.id,
            setNumber: s.setNumber,
            weight: s.weight ?? '',
            reps: s.reps ?? '',
            rpe: s.rpe ?? '',
          })),
        }))
      : [blankExercise()],
  };
}

function ExercisePreviousHint({ name, excludeId }) {
  const { data: entry } = useExerciseHistory(name, { before: excludeId });
  if (!entry) return null;
  const setsLabel = entry.sets.map((s) => `${s.weight ?? '-'}x${s.reps ?? '-'}`).join(', ');
  return (
    <p className={styles.previousHint}>
      Last ({formatDateLabel(entry.date.slice(0, 10))}): {setsLabel || 'no sets recorded'}
    </p>
  );
}

function ProgramBuilder({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [days, setDays] = useState([{ key: 'd0', name: 'Day A', exercises: [{ key: 'e0', name: '' }] }]);
  const createProgram = useCreateProgram();

  function addDay() {
    setDays((d) => [...d, { key: `d-${Date.now()}`, name: `Day ${d.length + 1}`, exercises: [{ key: `e-${Date.now()}`, name: '' }] }]);
  }

  function updateDay(key, patch) {
    setDays((d) => d.map((day) => (day.key === key ? { ...day, ...patch } : day)));
  }

  function removeDay(key) {
    setDays((d) => d.filter((day) => day.key !== key));
  }

  function addExercise(dayKey) {
    setDays((d) =>
      d.map((day) =>
        day.key === dayKey ? { ...day, exercises: [...day.exercises, { key: `e-${Date.now()}`, name: '' }] } : day
      )
    );
  }

  function updateExercise(dayKey, exKey, patch) {
    setDays((d) =>
      d.map((day) =>
        day.key === dayKey
          ? { ...day, exercises: day.exercises.map((ex) => (ex.key === exKey ? { ...ex, ...patch } : ex)) }
          : day
      )
    );
  }

  function removeExercise(dayKey, exKey) {
    setDays((d) =>
      d.map((day) => (day.key === dayKey ? { ...day, exercises: day.exercises.filter((ex) => ex.key !== exKey) } : day))
    );
  }

  function handleCreate() {
    if (!name) return;
    createProgram.mutate(
      {
        name,
        days: days
          .filter((d) => d.name)
          .map((d) => ({ name: d.name, exercises: d.exercises.filter((ex) => ex.name) })),
      },
      {
        onSuccess: () => {
          setName('');
          setDays([{ key: 'd0', name: 'Day A', exercises: [{ key: 'e0', name: '' }] }]);
          setOpen(false);
          onCreated?.();
        },
      }
    );
  }

  if (!open) {
    return (
      <button type="button" className={styles.linkButton} onClick={() => setOpen(true)}>
        + New program
      </button>
    );
  }

  return (
    <div>
      <div className={styles.field} style={{ marginBottom: '0.75rem' }}>
        <span className={styles.fieldLabel}>Program name</span>
        <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Push Pull Legs" />
      </div>

      {days.map((day) => (
        <div className={styles.dayCard} key={day.key}>
          <div className={styles.dayHeaderRow}>
            <input
              className={styles.input}
              value={day.name}
              onChange={(e) => updateDay(day.key, { name: e.target.value })}
              placeholder="Day name"
            />
            <button type="button" className={styles.removeButton} onClick={() => removeDay(day.key)} aria-label="Remove day">
              ✕
            </button>
          </div>
          {day.exercises.map((ex) => (
            <div className={styles.exerciseRow} key={ex.key} style={{ gridTemplateColumns: '1fr 2rem' }}>
              <input
                className={styles.input}
                value={ex.name}
                onChange={(e) => updateExercise(day.key, ex.key, { name: e.target.value })}
                placeholder="Exercise name"
              />
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => removeExercise(day.key, ex.key)}
                aria-label="Remove exercise"
              >
                ✕
              </button>
            </div>
          ))}
          <button type="button" className={styles.addButton} onClick={() => addExercise(day.key)}>
            + Add exercise
          </button>
        </div>
      ))}

      <button type="button" className={styles.addButton} onClick={addDay}>
        + Add day
      </button>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
        <button type="button" className={styles.saveButton} onClick={handleCreate} disabled={createProgram.isPending || !name}>
          {createProgram.isPending ? 'Saving...' : 'Save program'}
        </button>
        <button type="button" className={styles.editButton} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function Train() {
  const { data: programs = [] } = useActivePrograms();
  const { data: sessions = [] } = useTrainingLogs();
  const createTrainingLog = useCreateTrainingLog();
  const updateTrainingLog = useUpdateTrainingLog();
  const [editingId, setEditingId] = useState(null);
  const { data: editingLog } = useTrainingLog(editingId);
  const [form, setForm] = useState(blankForm());

  useEffect(() => {
    if (editingId && editingLog) setForm(buildFormFromTrainingLog(editingLog));
  }, [editingId, editingLog]);

  const selectedProgram = programs.find((p) => p.id === form.programId);
  const selectedDay = selectedProgram?.days.find((d) => d.id === form.programDayId);

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function loadDayExercises() {
    if (!selectedDay) return;
    setForm((f) => ({
      ...f,
      exercises: selectedDay.exercises.map((ex) => ({
        key: `ex-${ex.id}`,
        name: ex.name,
        sets: Array.from({ length: ex.targetSets || 1 }, (_, i) => blankSet(i + 1)),
      })),
    }));
  }

  function addExerciseRow() {
    setForm((f) => ({ ...f, exercises: [...f.exercises, blankExercise()] }));
  }

  function updateExerciseRow(key, patch) {
    setForm((f) => ({ ...f, exercises: f.exercises.map((ex) => (ex.key === key ? { ...ex, ...patch } : ex)) }));
  }

  function removeExerciseRow(key) {
    setForm((f) => ({ ...f, exercises: f.exercises.filter((ex) => ex.key !== key) }));
  }

  function addSetRow(exerciseKey) {
    setForm((f) => ({
      ...f,
      exercises: f.exercises.map((ex) =>
        ex.key === exerciseKey ? { ...ex, sets: [...ex.sets, blankSet(ex.sets.length + 1)] } : ex
      ),
    }));
  }

  function updateSetRow(exerciseKey, setKey, patch) {
    setForm((f) => ({
      ...f,
      exercises: f.exercises.map((ex) =>
        ex.key === exerciseKey
          ? { ...ex, sets: ex.sets.map((s) => (s.key === setKey ? { ...s, ...patch } : s)) }
          : ex
      ),
    }));
  }

  function removeSetRow(exerciseKey, setKey) {
    setForm((f) => ({
      ...f,
      exercises: f.exercises.map((ex) => (ex.key === exerciseKey ? { ...ex, sets: ex.sets.filter((s) => s.key !== setKey) } : ex)),
    }));
  }

  function startNewSession() {
    setEditingId(null);
    setForm(blankForm());
  }

  function handleSubmit(e) {
    e.preventDefault();
    const payload = {
      date: form.date,
      programId: form.programId || null,
      programDayId: form.programDayId || null,
      notes: form.notes || null,
      exercises: form.exercises
        .filter((ex) => ex.name)
        .map((ex) => ({
          name: ex.name,
          sets: ex.sets.map((s) => ({
            setNumber: s.setNumber,
            weight: s.weight === '' ? null : Number(s.weight),
            reps: s.reps === '' ? null : Number(s.reps),
            rpe: s.rpe === '' ? null : Number(s.rpe),
          })),
        })),
    };

    if (editingId) {
      updateTrainingLog.mutate({ id: editingId, ...payload });
    } else {
      createTrainingLog.mutate(payload, { onSuccess: () => setForm(blankForm()) });
    }
  }

  const saving = createTrainingLog.isPending || updateTrainingLog.isPending;
  const mutationError = createTrainingLog.error ?? updateTrainingLog.error;

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <h1>Train</h1>
        <button className={styles.saveButton} onClick={handleSubmit} disabled={saving} type="button">
          {saving ? 'Saving...' : editingId ? 'Update session' : 'Log session'}
        </button>
      </div>

      {mutationError && <p className={styles.error}>{mutationError.message}</p>}

      <PlanSection />

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Programs</h2>
        </div>
        {programs.length > 0 && (
          <div className={styles.programList} style={{ marginBottom: '0.75rem' }}>
            {programs.map((p) => (
              <div className={styles.programRow} key={p.id}>
                <span>{p.name}</span>
                <span className={styles.programMeta}>{p.days.length} day(s)</span>
              </div>
            ))}
          </div>
        )}
        <ProgramBuilder />
      </section>

      <form onSubmit={handleSubmit}>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{editingId ? 'Edit session' : 'Log a session'}</h2>
            {editingId && (
              <button type="button" className={styles.linkButton} onClick={startNewSession}>
                + New session instead
              </button>
            )}
          </div>

          <div className={styles.topRow}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Date</span>
              <input className={styles.input} type="date" value={form.date} onChange={(e) => updateField('date', e.target.value)} />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Program</span>
              <select
                className={styles.select}
                value={form.programId}
                onChange={(e) => updateField('programId', e.target.value)}
              >
                <option value="">None</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedProgram && (
            <div className={styles.topRow}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Day</span>
                <select
                  className={styles.select}
                  value={form.programDayId}
                  onChange={(e) => updateField('programDayId', e.target.value)}
                >
                  <option value="">Select day...</option>
                  {selectedProgram.days.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button type="button" className={styles.editButton} onClick={loadDayExercises} disabled={!selectedDay}>
                  Load day's exercises
                </button>
              </div>
            </div>
          )}

          {form.exercises.map((ex) => (
            <div className={styles.exerciseBlock} key={ex.key}>
              <div className={styles.exerciseBlockHeader}>
                <input
                  className={styles.input}
                  placeholder="Exercise name"
                  value={ex.name}
                  onChange={(e) => updateExerciseRow(ex.key, { name: e.target.value })}
                />
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => removeExerciseRow(ex.key)}
                  aria-label="Remove exercise"
                >
                  ✕
                </button>
              </div>
              {ex.name && <ExercisePreviousHint name={ex.name} excludeId={editingId} />}
              {ex.sets.map((s, i) => (
                <div className={styles.setRow} key={s.key}>
                  <span className={styles.setIndex}>{i + 1}</span>
                  <input
                    className={styles.input}
                    type="number"
                    inputMode="decimal"
                    placeholder="kg"
                    value={s.weight}
                    onChange={(e) => updateSetRow(ex.key, s.key, { weight: e.target.value })}
                  />
                  <input
                    className={styles.input}
                    type="number"
                    inputMode="numeric"
                    placeholder="reps"
                    value={s.reps}
                    onChange={(e) => updateSetRow(ex.key, s.key, { reps: e.target.value })}
                  />
                  <input
                    className={styles.input}
                    type="number"
                    inputMode="decimal"
                    placeholder="RPE"
                    value={s.rpe}
                    onChange={(e) => updateSetRow(ex.key, s.key, { rpe: e.target.value })}
                  />
                  <button
                    type="button"
                    className={styles.removeButton}
                    onClick={() => removeSetRow(ex.key, s.key)}
                    aria-label="Remove set"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button type="button" className={styles.addButton} onClick={() => addSetRow(ex.key)}>
                + Add set
              </button>
            </div>
          ))}

          <button type="button" className={styles.addButton} onClick={addExerciseRow}>
            + Add exercise
          </button>

          <label className={styles.field} style={{ marginTop: '0.75rem' }}>
            <span className={styles.fieldLabel}>Notes</span>
            <textarea
              className={styles.textarea}
              value={form.notes}
              onChange={(e) => updateField('notes', e.target.value)}
            />
          </label>
        </section>
      </form>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Recent sessions</h2>
        {sessions.length === 0 ? (
          <p className={styles.empty}>No sessions logged yet.</p>
        ) : (
          sessions.map((s) => (
            <div className={styles.sessionRow} key={s.id}>
              <span>{formatDateLabel(s.date.slice(0, 10))}</span>
              <button type="button" className={styles.editButton} onClick={() => setEditingId(s.id)}>
                Edit
              </button>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
