import { useState } from 'react';
import LineChart from '../components/LineChart.jsx';
import {
  useAssignProgram,
  useClients,
  useClientSummary,
  useCreateInvite,
  useRemoveClient,
} from '../hooks/useCoach.js';
import styles from './Clients.module.css';

function formatDateLabel(date) {
  return new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function blankDay(index) {
  return { key: `d-${Date.now()}-${index}`, name: `Day ${index + 1}`, exercises: [blankExercise()] };
}

function blankExercise() {
  return { key: `e-${Date.now()}-${Math.random()}`, name: '', targetSets: '', targetReps: '' };
}

function AssignProgramBuilder({ clientId }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [days, setDays] = useState([blankDay(0)]);
  const assignProgram = useAssignProgram(clientId);

  function addDay() {
    setDays((d) => [...d, blankDay(d.length)]);
  }

  function updateDay(key, patch) {
    setDays((d) => d.map((day) => (day.key === key ? { ...day, ...patch } : day)));
  }

  function removeDay(key) {
    setDays((d) => d.filter((day) => day.key !== key));
  }

  function addExercise(dayKey) {
    setDays((d) =>
      d.map((day) => (day.key === dayKey ? { ...day, exercises: [...day.exercises, blankExercise()] } : day))
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

  function reset() {
    setName('');
    setDescription('');
    setDays([blankDay(0)]);
  }

  function handleAssign() {
    if (!name) return;
    assignProgram.mutate(
      {
        name,
        description: description || null,
        days: days
          .filter((d) => d.name)
          .map((d) => ({
            name: d.name,
            exercises: d.exercises
              .filter((ex) => ex.name)
              .map((ex) => ({
                name: ex.name,
                targetSets: ex.targetSets === '' ? null : Number(ex.targetSets),
                targetReps: ex.targetReps === '' ? null : Number(ex.targetReps),
              })),
          })),
      },
      {
        onSuccess: () => {
          reset();
          setOpen(false);
        },
      }
    );
  }

  if (!open) {
    return (
      <button type="button" className={styles.linkButton} onClick={() => setOpen(true)}>
        + Assign a program
      </button>
    );
  }

  return (
    <div>
      <div className={styles.field} style={{ marginBottom: '0.75rem' }}>
        <span className={styles.fieldLabel}>Program name</span>
        <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Push Pull Legs" />
      </div>
      <div className={styles.field} style={{ marginBottom: '0.75rem' }}>
        <span className={styles.fieldLabel}>Description (optional)</span>
        <input className={styles.input} value={description} onChange={(e) => setDescription(e.target.value)} />
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
            <div className={styles.exerciseRow} key={ex.key}>
              <input
                className={styles.input}
                value={ex.name}
                onChange={(e) => updateExercise(day.key, ex.key, { name: e.target.value })}
                placeholder="Exercise name"
              />
              <input
                className={styles.input}
                type="number"
                inputMode="numeric"
                placeholder="sets"
                value={ex.targetSets}
                onChange={(e) => updateExercise(day.key, ex.key, { targetSets: e.target.value })}
              />
              <input
                className={styles.input}
                type="number"
                inputMode="numeric"
                placeholder="reps"
                value={ex.targetReps}
                onChange={(e) => updateExercise(day.key, ex.key, { targetReps: e.target.value })}
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

      {assignProgram.isError && <p className={styles.error}>{assignProgram.error.message}</p>}

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
        <button
          type="button"
          className={styles.saveButton}
          onClick={handleAssign}
          disabled={assignProgram.isPending || !name}
        >
          {assignProgram.isPending ? 'Assigning...' : 'Assign program'}
        </button>
        <button type="button" className={styles.editButton} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function ClientDetail({ clientId }) {
  const { data: summary, isLoading } = useClientSummary(clientId);

  if (isLoading || !summary) {
    return <div className="skeleton" style={{ height: 160 }} />;
  }

  const weighIns = summary.weighIns ?? [];
  const recentSessions = summary.recentSessions ?? [];
  const programs = summary.programs ?? [];

  return (
    <div className={styles.clientDetail}>
      <h3 className={styles.detailSectionTitle}>Weight trend</h3>
      {weighIns.length > 0 ? (
        <LineChart labels={weighIns.map((w) => w.date.slice(5, 10))} values={weighIns.map((w) => w.weight)} height={140} />
      ) : (
        <p className={styles.empty}>No weigh-ins logged yet.</p>
      )}

      <h3 className={styles.detailSectionTitle}>Recent sessions</h3>
      {recentSessions.length > 0 ? (
        recentSessions.map((s) => (
          <div className={styles.sessionRow} key={s.id}>
            <span className={styles.sessionMeta}>{formatDateLabel(s.date)}</span>
            <span>{s.notes || 'No notes'}</span>
          </div>
        ))
      ) : (
        <p className={styles.empty}>No sessions logged yet.</p>
      )}

      <h3 className={styles.detailSectionTitle}>Programs</h3>
      {programs.length > 0 ? (
        programs.map((p) => (
          <div className={styles.programRow} key={p.id}>
            <span>{p.name}</span>
            {p.fromMe && <span className={styles.tag}>yours</span>}
          </div>
        ))
      ) : (
        <p className={styles.empty}>No programs yet.</p>
      )}

      <h3 className={styles.detailSectionTitle}>Assign a program</h3>
      <AssignProgramBuilder clientId={clientId} />
    </div>
  );
}

export default function Clients() {
  const { data, isLoading } = useClients();
  const createInvite = useCreateInvite();
  const removeClient = useRemoveClient();
  const [newCode, setNewCode] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  function handleCreateInvite() {
    createInvite.mutate(undefined, {
      onSuccess: (result) => setNewCode(result.inviteCode),
    });
  }

  async function copyCode(code) {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // clipboard not available — ignore
    }
  }

  const clients = data?.clients ?? [];
  const pendingInvites = data?.pendingInvites ?? [];

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <h1>Clients</h1>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Invite a client</h2>
        {createInvite.isError && <p className={styles.error}>{createInvite.error.message}</p>}
        {newCode && (
          <div className={styles.inviteCodeBox}>
            <span className={styles.inviteCode}>{newCode}</span>
            <button type="button" className={styles.editButton} onClick={() => copyCode(newCode)}>
              Copy
            </button>
          </div>
        )}
        <button type="button" className={styles.saveButton} onClick={handleCreateInvite} disabled={createInvite.isPending}>
          {createInvite.isPending ? 'Generating...' : 'Generate invite code'}
        </button>
        <p className={styles.hint}>Share this code with your client — they enter it under More.</p>

        {pendingInvites.length > 0 && (
          <>
            <h3 className={styles.detailSectionTitle}>Pending invites</h3>
            {pendingInvites.map((invite) => (
              <div className={styles.inviteRow} key={invite.linkId}>
                <span className={styles.inviteRowCode}>{invite.inviteCode}</span>
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => removeClient.mutate(invite.linkId)}
                  aria-label="Remove invite"
                >
                  ✕
                </button>
              </div>
            ))}
          </>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Your clients</h2>
        {isLoading ? (
          <div className="skeleton" style={{ height: 120 }} />
        ) : clients.length === 0 ? (
          <p className={styles.empty}>No clients yet. Send an invite code to get started.</p>
        ) : (
          clients.map((client) => (
            <div className={styles.clientRow} key={client.linkId}>
              <div
                className={styles.clientHead}
                onClick={() => setExpandedId((id) => (id === client.clientId ? null : client.clientId))}
              >
                <div>
                  <div className={styles.clientName}>{client.displayName}</div>
                  <div className={styles.clientEmail}>{client.email}</div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button
                    type="button"
                    className={styles.removeButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Remove ${client.displayName} as a client?`)) {
                        removeClient.mutate(client.linkId);
                      }
                    }}
                    aria-label="Remove client"
                  >
                    ✕
                  </button>
                  <span>{expandedId === client.clientId ? '▲' : '▼'}</span>
                </div>
              </div>
              {expandedId === client.clientId && <ClientDetail clientId={client.clientId} />}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
