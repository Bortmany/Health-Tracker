import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PlanSection from '../components/PlanSection.jsx';
import RestTimer from '../components/RestTimer.jsx';
import {
  Button,
  Card,
  EmptyState,
  ErrorText,
  Field,
  Input,
  Screen,
  SectionTitle,
  Select,
  Skeleton,
} from '../components/ui/index.js';
import { useExercises } from '../hooks/useExercises.js';
import { useActivePrograms, useCreateProgram, useUpdateProgram } from '../hooks/usePrograms.js';
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

// One exercise block in the session logger. Fetches the exercise's previous
// session once and shows it two ways: a summary line under the name, and a
// per-set "prev 60×8" hint so the number to beat sits right next to each set.
function ExerciseBlock({ exercise, editingId, doneSets, onToggleDone, onUpdate, onRemove, onAddSet, onUpdateSet, onRemoveSet }) {
  const { data: previous } = useExerciseHistory(exercise.name, { before: editingId });
  const previousSets = previous?.sets ?? [];
  const summary = previousSets.map((s) => `${s.weight ?? '-'}x${s.reps ?? '-'}`).join(', ');

  return (
    <div className={styles.exerciseBlock}>
      <div className={styles.exerciseBlockHeader}>
        <Input
          placeholder="Exercise name"
          value={exercise.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          list="exercise-library"
        />
        <button type="button" className={styles.removeButton} onClick={onRemove} aria-label="Remove exercise">
          ✕
        </button>
      </div>
      {exercise.name && previous && (
        <p className={styles.previousHint}>
          Last ({formatDateLabel(previous.date.slice(0, 10))}): {summary || 'no sets recorded'}
        </p>
      )}
      {exercise.sets.map((s, i) => {
        const prevSet = previousSets.find((p) => p.setNumber === s.setNumber);
        const done = Boolean(doneSets[s.key]);
        return (
          <div className={styles.setRow} key={s.key}>
            <span className={styles.setIndex}>{i + 1}</span>
            <Input
              type="number"
              inputMode="decimal"
              placeholder="kg"
              value={s.weight}
              onChange={(e) => onUpdateSet(s.key, { weight: e.target.value })}
            />
            <Input
              type="number"
              inputMode="numeric"
              placeholder="reps"
              value={s.reps}
              onChange={(e) => onUpdateSet(s.key, { reps: e.target.value })}
            />
            <Input
              type="number"
              inputMode="decimal"
              placeholder="RPE"
              value={s.rpe}
              onChange={(e) => onUpdateSet(s.key, { rpe: e.target.value })}
            />
            <label className={styles.doneToggle} title="Mark set done and start the rest timer">
              <input
                type="checkbox"
                checked={done}
                onChange={(e) => onToggleDone(s.key, e.target.checked)}
                aria-label={`Set ${i + 1} done`}
              />
            </label>
            <button
              type="button"
              className={styles.removeButton}
              onClick={() => onRemoveSet(s.key)}
              aria-label="Remove set"
            >
              ✕
            </button>
            {prevSet && (
              <span className={styles.setPrev}>
                prev {prevSet.weight ?? '-'}×{prevSet.reps ?? '-'}
              </span>
            )}
          </div>
        );
      })}
      <Button variant="ghost" block onClick={onAddSet}>
        + Add set
      </Button>
    </div>
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
      <Button variant="ghost" block onClick={() => setOpen(true)}>
        + New program
      </Button>
    );
  }

  return (
    <div className={styles.builder}>
      <Field label="Program name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Push Pull Legs" />
      </Field>

      {days.map((day) => (
        <div className={styles.dayCard} key={day.key}>
          <div className={styles.dayHeaderRow}>
            <Input value={day.name} onChange={(e) => updateDay(day.key, { name: e.target.value })} placeholder="Day name" />
            <button type="button" className={styles.removeButton} onClick={() => removeDay(day.key)} aria-label="Remove day">
              ✕
            </button>
          </div>
          {day.exercises.map((ex) => (
            <div className={styles.builderExerciseRow} key={ex.key}>
              <Input
                value={ex.name}
                onChange={(e) => updateExercise(day.key, ex.key, { name: e.target.value })}
                placeholder="Exercise name"
                list="exercise-library"
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
          <Button variant="ghost" block onClick={() => addExercise(day.key)}>
            + Add exercise
          </Button>
        </div>
      ))}

      <Button variant="ghost" block onClick={addDay}>
        + Add day
      </Button>

      {createProgram.isError && <ErrorText>{createProgram.error.message}</ErrorText>}

      <div className={styles.buttonRow}>
        <Button onClick={handleCreate} disabled={createProgram.isPending || !name}>
          {createProgram.isPending ? 'Saving...' : 'Save program'}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export default function Train() {
  const { data: programs = [], isLoading: programsLoading } = useActivePrograms();
  const { data: sessions = [] } = useTrainingLogs();
  const { data: exerciseOptions = [] } = useExercises();
  const createTrainingLog = useCreateTrainingLog();
  const updateTrainingLog = useUpdateTrainingLog();
  const updateProgram = useUpdateProgram();
  const [editingId, setEditingId] = useState(null);
  const { data: editingLog } = useTrainingLog(editingId);
  const [form, setForm] = useState(blankForm());
  // "Done" checkmarks are session-flow aids only: local state for this visit,
  // never saved — ticking one auto-starts the rest timer.
  const [doneSets, setDoneSets] = useState({});
  const [showSaveChoice, setShowSaveChoice] = useState(false);
  const restTimerRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep links from the Today screen: ?edit=<sessionId> opens that session,
  // ?program=<id>&day=<id> pre-selects the next program day.
  useEffect(() => {
    const edit = searchParams.get('edit');
    const programId = searchParams.get('program');
    const dayId = searchParams.get('day');
    if (edit) {
      setEditingId(edit);
    } else if (programId) {
      setForm((f) => ({ ...f, programId, programDayId: dayId ?? '' }));
    }
    if (edit || programId || dayId) setSearchParams({}, { replace: true });
    // Run once on mount — the params are consumed and cleared.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setDoneSets({});
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

  function toggleDone(setKey, checked) {
    setDoneSets((d) => ({ ...d, [setKey]: checked }));
    if (checked) restTimerRef.current?.start();
  }

  function startNewSession() {
    setEditingId(null);
    setForm(blankForm());
    setDoneSets({});
    setShowSaveChoice(false);
  }

  function buildPayload() {
    return {
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
  }

  function saveSession() {
    const payload = buildPayload();
    if (editingId) {
      updateTrainingLog.mutate({ id: editingId, ...payload });
    } else {
      createTrainingLog.mutate(payload, {
        onSuccess: () => {
          setForm(blankForm());
          setDoneSets({});
        },
      });
    }
  }

  // "Update my program too": save the session first and only then replace the
  // program day's exercises — the program update swaps out the day records the
  // session points at, so running both at once could make the saves collide.
  function saveSessionAndProgram() {
    if (!selectedProgram || !selectedDay || !editingId) {
      saveSession();
      return;
    }
    updateTrainingLog.mutate(
      { id: editingId, ...buildPayload() },
      { onSuccess: () => updateProgramDays() }
    );
  }

  function updateProgramDays() {
    const editedDayName = selectedDay.name;
    updateProgram.mutate(
      {
        id: selectedProgram.id,
        days: selectedProgram.days.map((d) =>
          d.id === form.programDayId
            ? {
                name: d.name,
                exercises: form.exercises
                  .filter((ex) => ex.name)
                  .map((ex) => {
                    const existing = d.exercises.find((pe) => pe.name.toLowerCase() === ex.name.toLowerCase());
                    return { name: ex.name, targetSets: ex.sets.length, targetReps: existing?.targetReps ?? null };
                  }),
              }
            : {
                name: d.name,
                exercises: d.exercises.map((pe) => ({
                  name: pe.name,
                  targetSets: pe.targetSets ?? null,
                  targetReps: pe.targetReps ?? null,
                })),
              }
        ),
      },
      {
        onSuccess: (data) => {
          // Replacing days gives them fresh ids — re-select the edited day
          // by name so the form's Day picker stays valid.
          const freshDay = data?.program?.days?.find((d) => d.name === editedDayName);
          if (freshDay) setForm((f) => ({ ...f, programDayId: freshDay.id }));
        },
      }
    );
  }

  function handleSubmit(e) {
    e.preventDefault();
    // Editing a session tied to a program day: ask whether the change is
    // just for today or should update the program itself.
    if (editingId && form.programDayId && selectedProgram && selectedDay) {
      setShowSaveChoice(true);
      return;
    }
    saveSession();
  }

  const saving = createTrainingLog.isPending || updateTrainingLog.isPending;
  const mutationError = createTrainingLog.error ?? updateTrainingLog.error ?? updateProgram.error;

  return (
    <Screen
      title="Train"
      actions={
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? 'Saving...' : editingId ? 'Update session' : 'Log session'}
        </Button>
      }
    >
      {mutationError && <ErrorText>{mutationError.message}</ErrorText>}

      <datalist id="exercise-library">
        {exerciseOptions.map((ex) => (
          <option key={ex.id} value={ex.name} />
        ))}
      </datalist>

      <PlanSection />

      <Card className={styles.stackCard} title="Programs">
        {programsLoading ? (
          <Skeleton height={80} />
        ) : (
          <>
            {programs.length === 0 && (
              <p className={styles.mutedLine}>No program yet. Adopt a recommended plan above, or build your own below.</p>
            )}
            {programs.length > 0 && (
              <div className={styles.programList}>
                {programs.map((p) => (
                  <div className={styles.programRow} key={p.id}>
                    <span>{p.name}</span>
                    <span className={styles.programRowMeta}>
                      {p.fromCoach && <span className={styles.tag}>From your coach</span>}
                      <span className={styles.programMeta}>{p.days.length} day(s)</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <ProgramBuilder />
          </>
        )}
      </Card>

      <form onSubmit={handleSubmit}>
        <Card className={styles.stackCard}>
          <div className={styles.sectionHeader}>
            <SectionTitle>{editingId ? 'Edit session' : 'Log a session'}</SectionTitle>
            {editingId && (
              <Button variant="ghost" size="sm" onClick={startNewSession}>
                + New session instead
              </Button>
            )}
          </div>

          <RestTimer ref={restTimerRef} />

          {showSaveChoice && (
            <div className={styles.saveChoice}>
              <p className={styles.saveChoiceCopy}>
                Save this change for just today, or update your program so it applies every time?
              </p>
              <div className={styles.buttonRow}>
                <Button
                  onClick={() => {
                    setShowSaveChoice(false);
                    saveSession();
                  }}
                >
                  Just today
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowSaveChoice(false);
                    saveSessionAndProgram();
                  }}
                >
                  Update my program too
                </Button>
                <Button variant="ghost" onClick={() => setShowSaveChoice(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <div className={styles.topRow}>
            <Field label="Date">
              <Input type="date" value={form.date} onChange={(e) => updateField('date', e.target.value)} />
            </Field>
            <Field label="Program">
              <Select value={form.programId} onChange={(e) => updateField('programId', e.target.value)}>
                <option value="">None</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {selectedProgram && (
            <div className={styles.topRow}>
              <Field label="Day">
                <Select value={form.programDayId} onChange={(e) => updateField('programDayId', e.target.value)}>
                  <option value="">Select day...</option>
                  {selectedProgram.days.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className={styles.loadDayCell}>
                <Button variant="secondary" onClick={loadDayExercises} disabled={!selectedDay}>
                  Load day's exercises
                </Button>
              </div>
            </div>
          )}

          {form.exercises.map((ex) => (
            <ExerciseBlock
              key={ex.key}
              exercise={ex}
              editingId={editingId}
              doneSets={doneSets}
              onToggleDone={toggleDone}
              onUpdate={(patch) => updateExerciseRow(ex.key, patch)}
              onRemove={() => removeExerciseRow(ex.key)}
              onAddSet={() => addSetRow(ex.key)}
              onUpdateSet={(setKey, patch) => updateSetRow(ex.key, setKey, patch)}
              onRemoveSet={(setKey) => removeSetRow(ex.key, setKey)}
            />
          ))}

          <Button variant="ghost" block onClick={addExerciseRow}>
            + Add exercise
          </Button>

          <div className={styles.notesField}>
            <Field label="Notes">
              <textarea
                className={styles.textarea}
                value={form.notes}
                onChange={(e) => updateField('notes', e.target.value)}
              />
            </Field>
          </div>
        </Card>
      </form>

      <Card className={styles.stackCard} title="Recent sessions">
        {sessions.length === 0 ? (
          <EmptyState>No sessions yet — your first one starts your log.</EmptyState>
        ) : (
          sessions.map((s) => (
            <div className={styles.sessionRow} key={s.id}>
              <span>{formatDateLabel(s.date.slice(0, 10))}</span>
              <Button variant="secondary" size="sm" onClick={() => setEditingId(s.id)}>
                Edit
              </Button>
            </div>
          ))
        )}
      </Card>
    </Screen>
  );
}
