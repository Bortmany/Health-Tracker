import { useState } from 'react';
import LineChart from '../components/LineChart.jsx';
import {
  Button,
  Card,
  EmptyState,
  ErrorText,
  Field,
  Input,
  Screen,
  SectionTitle,
  Skeleton,
  Tooltip,
} from '../components/ui/index.js';
import {
  useAssignProgram,
  useClients,
  useClientSummary,
  useCreateInvite,
  useRemoveClient,
} from '../hooks/useCoach.js';
import { smoothSeries, trendCaption } from '../lib/trend.js';
import styles from './Clients.module.css';

function formatDateLabel(date) {
  return new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function startOfThisWeek() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysSince(dateStr) {
  const then = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((now - then) / 86400000);
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
      <Button variant="ghost" block onClick={() => setOpen(true)}>
        + Assign a program
      </Button>
    );
  }

  return (
    <div className={styles.builder}>
      <Field label="Program name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Push Pull Legs" />
      </Field>
      <Field label="Description (optional)">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      {days.map((day) => (
        <div className={styles.dayCard} key={day.key}>
          <div className={styles.dayHeaderRow}>
            <Input value={day.name} onChange={(e) => updateDay(day.key, { name: e.target.value })} placeholder="Day name" />
            <Tooltip label="Remove day">
              <button type="button" className={styles.removeButton} onClick={() => removeDay(day.key)} aria-label="Remove day">
                ✕
              </button>
            </Tooltip>
          </div>
          {day.exercises.map((ex) => (
            <div className={styles.exerciseRow} key={ex.key}>
              <Input
                value={ex.name}
                onChange={(e) => updateExercise(day.key, ex.key, { name: e.target.value })}
                placeholder="Exercise name"
              />
              <Input
                type="number"
                inputMode="numeric"
                placeholder="sets"
                value={ex.targetSets}
                onChange={(e) => updateExercise(day.key, ex.key, { targetSets: e.target.value })}
              />
              <Input
                type="number"
                inputMode="numeric"
                placeholder="reps"
                value={ex.targetReps}
                onChange={(e) => updateExercise(day.key, ex.key, { targetReps: e.target.value })}
              />
              <Tooltip label="Remove exercise">
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => removeExercise(day.key, ex.key)}
                  aria-label="Remove exercise"
                >
                  ✕
                </button>
              </Tooltip>
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

      {assignProgram.isError && <ErrorText>{assignProgram.error.message}</ErrorText>}

      <div className={styles.buttonRow}>
        <Button onClick={handleAssign} disabled={assignProgram.isPending || !name}>
          {assignProgram.isPending ? 'Assigning...' : 'Assign program'}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ClientDetail({ clientId, summary, isLoading }) {
  if (isLoading || !summary) {
    return <Skeleton height={160} style={{ marginTop: 'var(--space-3)' }} />;
  }

  const weighIns = summary.weighIns ?? [];
  const recentSessions = summary.recentSessions ?? [];
  const programs = summary.programs ?? [];
  const rawWeights = weighIns.map((w) => Number(w.weight));
  const trend = smoothSeries(rawWeights);
  const caption = trendCaption(weighIns, trend);

  return (
    <div className={styles.clientDetail}>
      <div className={styles.detailSection}>
        <SectionTitle>Weight trend</SectionTitle>
        {weighIns.length > 0 ? (
          <>
            <LineChart
              labels={weighIns.map((w) => w.date.slice(5, 10))}
              values={trend}
              rawValues={rawWeights}
              height={140}
            />
            {caption && <p className={styles.trendCaption}>{caption}</p>}
          </>
        ) : (
          <p className={styles.mutedLine}>No weigh-ins logged yet.</p>
        )}
      </div>

      <div className={styles.detailSection}>
        <SectionTitle>Recent sessions</SectionTitle>
        {recentSessions.length > 0 ? (
          recentSessions.map((s) => (
            <div className={styles.sessionRow} key={s.id}>
              <span className={styles.sessionMeta}>{formatDateLabel(s.date)}</span>
              <span>{s.notes || 'No notes'}</span>
            </div>
          ))
        ) : (
          <p className={styles.mutedLine}>No sessions logged yet.</p>
        )}
      </div>

      <div className={styles.detailSection}>
        <SectionTitle>Programs</SectionTitle>
        {programs.length > 0 ? (
          programs.map((p) => (
            <div className={styles.programRow} key={p.id}>
              <span>{p.name}</span>
              {p.fromMe && <span className={styles.tag}>yours</span>}
            </div>
          ))
        ) : (
          <p className={styles.mutedLine}>No programs yet.</p>
        )}
      </div>

      <div className={styles.detailSection}>
        <SectionTitle>Assign a program</SectionTitle>
        <AssignProgramBuilder clientId={clientId} />
      </div>
    </div>
  );
}

// One triage row: name, weight direction, sessions this week, last log.
// The summary loads for every row up front so the coach can scan without
// tapping; expanding is instant because the data is already cached.
function ClientRow({ client, expanded, onToggle, onRemove }) {
  const { data: summary, isLoading } = useClientSummary(client.clientId);

  const weighIns = summary?.weighIns ?? [];
  const recentSessions = summary?.recentSessions ?? [];

  let direction = null;
  if (weighIns.length >= 2) {
    const diff = Number(weighIns[weighIns.length - 1].weight) - Number(weighIns[weighIns.length - 2].weight);
    direction = Math.abs(diff) < 0.05 ? 'steady' : `${diff < 0 ? '↓' : '↑'} ${Math.abs(diff).toFixed(1)} kg`;
  }

  const weekStart = startOfThisWeek();
  const sessionsThisWeek = recentSessions.filter(
    (s) => new Date(`${s.date.slice(0, 10)}T00:00:00`) >= weekStart
  ).length;

  // Approximation: the most recent of the last weigh-in and last session
  // (the summary endpoint has no general "last log of any kind" date yet).
  const lastDates = [weighIns[weighIns.length - 1]?.date, recentSessions[0]?.date].filter(Boolean);
  let lastLog = 'No logs yet';
  if (lastDates.length > 0) {
    const days = Math.min(...lastDates.map(daysSince));
    lastLog = days <= 0 ? 'Logged today' : days === 1 ? 'Last log: yesterday' : `Last log: ${days} days ago`;
  }

  return (
    <div className={styles.clientRow}>
      <div className={styles.clientHead} onClick={onToggle}>
        <div className={styles.clientInfo}>
          <div className={styles.clientName}>{client.displayName}</div>
          <div className={styles.clientEmail}>{client.email}</div>
          {isLoading ? (
            <Skeleton width="70%" height="0.8rem" style={{ marginTop: 'var(--space-1)' }} />
          ) : (
            <div className={styles.triageStats}>
              {direction && <span>{direction}</span>}
              <span>
                {sessionsThisWeek} session{sessionsThisWeek === 1 ? '' : 's'} this week
              </span>
              <span>{lastLog}</span>
            </div>
          )}
        </div>
        <div className={styles.rowActions}>
          <Tooltip label={`Remove ${client.displayName}`}>
            <button
              type="button"
              className={styles.removeGhost}
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              aria-label={`Remove ${client.displayName}`}
            >
              ✕
            </button>
          </Tooltip>
          <span className={styles.chevron}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>
      {expanded && <ClientDetail clientId={client.clientId} summary={summary} isLoading={isLoading} />}
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
    <Screen title="Clients">
      <Card className={styles.stackCard} title="Invite a client">
        {newCode && (
          <div className={styles.inviteCodeBox}>
            <span className={styles.inviteCode}>{newCode}</span>
            <Button variant="secondary" size="sm" onClick={() => copyCode(newCode)}>
              Copy
            </Button>
          </div>
        )}
        <Button onClick={handleCreateInvite} disabled={createInvite.isPending}>
          {createInvite.isPending ? 'Generating...' : 'Generate invite code'}
        </Button>
        {createInvite.isError && <ErrorText>{createInvite.error.message}</ErrorText>}
        <p className={styles.hint}>Share this code with your client — they enter it under More.</p>

        {pendingInvites.length > 0 && (
          <div className={styles.pendingBlock}>
            <SectionTitle>Pending invites</SectionTitle>
            {pendingInvites.map((invite) => (
              <div className={styles.inviteRow} key={invite.linkId}>
                <span className={styles.inviteRowCode}>{invite.inviteCode}</span>
                <button
                  type="button"
                  className={styles.removeGhost}
                  onClick={() => removeClient.mutate(invite.linkId)}
                  aria-label="Remove invite"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className={styles.stackCard} title="Your clients">
        {isLoading ? (
          <Skeleton height="3.5rem" count={3} />
        ) : clients.length === 0 ? (
          <EmptyState>No clients yet. Send an invite code to get started.</EmptyState>
        ) : (
          clients.map((client) => (
            <ClientRow
              key={client.linkId}
              client={client}
              expanded={expandedId === client.clientId}
              onToggle={() => setExpandedId((id) => (id === client.clientId ? null : client.clientId))}
              onRemove={() => {
                if (window.confirm(`Remove ${client.displayName} as a client?`)) {
                  removeClient.mutate(client.linkId);
                }
              }}
            />
          ))
        )}
      </Card>
    </Screen>
  );
}
