import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import LineChart from '../components/LineChart.jsx';
import Sparkline from '../components/Sparkline.jsx';
import {
  Avatar,
  Button,
  Card,
  Chip,
  ConfirmDialog,
  EmptyState,
  ErrorText,
  Field,
  Input,
  Screen,
  SectionTitle,
  Skeleton,
  StatCard,
  TextArea,
  Toast,
  useToast,
} from '../components/ui/index.js';
import {
  useAssignProgram,
  useClientNote,
  useClients,
  useClientSummary,
  useCreateInvite,
  useRemoveClient,
  useSaveClientNote,
} from '../hooks/useCoach.js';
import {
  useAcceptRequest,
  useCoachRequests,
  useDeclineRequest,
  useInviteByEmail,
} from '../hooks/useCoachRequests.js';
import { emailError } from '../lib/validation.js';
import { smoothSeries, trendCaption } from '../lib/trend.js';
import styles from './Clients.module.css';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateLabel(date) {
  return new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// "just now" / "today at 3:42 PM" / "Sep 4 at 3:42 PM" for the note's last-saved line.
function formatSavedTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  if (Number.isNaN(d.getTime()) || now - d < 60000) return 'just now';
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `today at ${time}`;
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${time}`;
}

// Attention = never logged, or quiet for 3+ days (the server already sorts these first).
function needsAttention(client) {
  return client.quietDays == null || client.quietDays >= 3;
}

// On track = logged at least as many sessions as their program has days this
// week. A client with no program isn't on or off track — just unmeasured.
function isOnTrack(client) {
  const planned = client.adherence?.planned ?? 0;
  return planned > 0 && (client.adherence?.done ?? 0) >= planned;
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
            <button type="button" className={styles.removeButton} onClick={() => removeDay(day.key)} aria-label="Remove day">
              ✕
            </button>
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

const NOTE_MAX = 4000;
const NOTE_COUNTER_FROM = 3800;

// Private notes on one client. Saves when the coach taps away from the box,
// never on every keystroke, and never throws away what they typed on a failure.
function ClientNotes({ clientId, onSaved }) {
  const note = useClientNote(clientId);
  const save = useSaveClientNote(clientId);
  // `draft` is null until the coach types; before that the box shows the saved text.
  const [draft, setDraft] = useState(null);
  const [savedAtOverride, setSavedAtOverride] = useState(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const lastSavedRef = useRef(null); // text the server is known to hold
  const inFlightRef = useRef(false); // a PUT is running right now
  const queuedRef = useRef(false); // the text changed again mid-save — save once more when done
  const latestRef = useRef('');

  const loadedBody = note.data?.note?.body ?? '';
  const value = draft ?? loadedBody;
  const savedAt = savedAtOverride ?? note.data?.note?.updatedAt ?? null;
  latestRef.current = value;

  // Saves run one at a time, always with the newest text, so an older save can
  // never overwrite a newer one and only the final save decides what to show.
  async function runSave() {
    const text = latestRef.current;
    inFlightRef.current = true;
    queuedRef.current = false;
    setSaving(true);
    setSaveFailed(false);
    let ok = false;
    let result = null;
    try {
      result = await save.mutateAsync(text);
      ok = true;
    } catch {
      ok = false;
    }
    inFlightRef.current = false;
    if (queuedRef.current) {
      // Newer text is waiting — its save is the one that gets to report.
      if (ok) lastSavedRef.current = text;
      runSave();
      return;
    }
    setSaving(false);
    if (ok) {
      lastSavedRef.current = text;
      // Clearing the note returns null — the moment of clearing is the "last saved" time.
      setSavedAtOverride(result?.note?.updatedAt ?? new Date().toISOString());
      onSaved('Saved');
    } else {
      // Keep the text; tapping away again retries the same save.
      setSaveFailed(true);
    }
  }

  function handleBlur() {
    const baseline = lastSavedRef.current ?? loadedBody;
    if (value === baseline) return;
    if (inFlightRef.current) {
      queuedRef.current = true;
      return;
    }
    runSave();
  }

  if (note.isLoading) {
    return <Skeleton height="6rem" />;
  }

  if (note.isError) {
    return (
      <>
        <ErrorText>Couldn&apos;t load your notes — please try again.</ErrorText>
        <Button variant="secondary" size="sm" onClick={() => note.refetch()}>
          Retry
        </Button>
      </>
    );
  }

  return (
    <>
      <TextArea
        rows={4}
        maxLength={NOTE_MAX}
        placeholder="e.g. mentioned a knee niggle, check in Thursday"
        value={value}
        onChange={(e) => setDraft(e.target.value.slice(0, NOTE_MAX))}
        onBlur={handleBlur}
        aria-label="Private notes about this client"
      />
      {value.length >= NOTE_COUNTER_FROM && (
        <div className={value.length >= NOTE_MAX ? styles.counterOver : styles.counter} aria-live="polite">
          {value.length}/{NOTE_MAX}
        </div>
      )}
      {saving ? (
        <p className={styles.noteStatus}>Saving...</p>
      ) : saveFailed ? (
        <ErrorText>Couldn&apos;t save your note — please try again.</ErrorText>
      ) : savedAt ? (
        <p className={styles.noteStatus}>Last saved {formatSavedTime(savedAt)}</p>
      ) : null}
    </>
  );
}

// The expanded row. The summary loads only once a row is opened — the list
// rows already carry everything the coach needs to scan without tapping.
function ClientDetail({ clientId, onToast }) {
  const { data: summary, isLoading, isError, refetch } = useClientSummary(clientId);

  if (isError) {
    return (
      <div className={styles.clientDetail}>
        <ErrorText>Couldn&apos;t load this client&apos;s details — please try again.</ErrorText>
        <Button variant="secondary" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

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

      <div className={styles.detailSection}>
        <SectionTitle>Notes (only you see these)</SectionTitle>
        <ClientNotes clientId={clientId} onSaved={onToast} />
      </div>
    </div>
  );
}

// A student who asked to train with this coach. Each row owns its own
// requests so "Accepting..." and any error stay on the row they belong to.
function RequestRow({ request, onDone }) {
  const accept = useAcceptRequest();
  const decline = useDeclineRequest();
  const busy = accept.isPending || decline.isPending;

  const takenElsewhere = accept.isError && accept.error?.status === 409;
  const failed = (accept.isError && !takenElsewhere) || decline.isError;

  return (
    <div className={styles.requestRow}>
      <div className={styles.requestHead}>
        <div className={styles.clientInfo}>
          <div className={styles.clientName}>{request.displayName}</div>
          <div className={styles.clientEmail}>Requested {formatDate(request.createdAt)}</div>
        </div>
        <div className={styles.rowActions}>
          <Button
            size="sm"
            onClick={() =>
              accept.mutate(request.id, {
                onSuccess: () => onDone(`Accepted — ${request.displayName} is now training with you.`),
              })
            }
            disabled={busy}
          >
            {accept.isPending ? 'Accepting...' : 'Accept'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => decline.mutate(request.id, { onSuccess: () => onDone('Declined.') })}
            disabled={busy}
          >
            {decline.isPending ? 'Declining...' : 'Decline'}
          </Button>
        </div>
      </div>
      {takenElsewhere && <ErrorText>This student now has another coach — nothing to do here.</ErrorText>}
      {failed && <ErrorText>Couldn&apos;t save that — please try again.</ErrorText>}
    </div>
  );
}

// Enter an email; the answer is the same neutral line whether or not that
// address has a Cut account, so the coach can never tell which it was.
function InviteByEmail({ onSent }) {
  const invite = useInviteByEmail();
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);

  const message = emailError(email);
  const canSend = email.trim() !== '' && !message && !invite.isPending;
  const rateLimited = invite.isError && (invite.error?.status === 429 || invite.error?.code === 'RATE_LIMITED');

  function handleSubmit(e) {
    e.preventDefault();
    setTouched(true);
    if (!canSend) return;
    invite.mutate(email.trim(), {
      onSuccess: () => {
        setEmail('');
        setTouched(false);
        onSent("If that address has a Cut account, they'll see your invite.");
      },
    });
  }

  return (
    <form className={styles.emailInviteBlock} onSubmit={handleSubmit} noValidate>
      <div className={styles.emailInviteRow}>
        <div className={styles.emailInviteField}>
          <Field label="Invite by email" error={touched ? message : ''}>
            <Input
              type="email"
              placeholder="clientname@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched(true)}
              autoComplete="off"
              aria-invalid={touched && message ? 'true' : undefined}
            />
          </Field>
        </div>
        <Button type="submit" size="sm" disabled={!canSend}>
          {invite.isPending ? 'Sending...' : 'Send invite'}
        </Button>
      </div>
      {rateLimited ? (
        <ErrorText>You&apos;ve sent a lot of invites today — try again tomorrow</ErrorText>
      ) : (
        invite.isError && <ErrorText>{invite.error?.message || "Couldn't send that — please try again."}</ErrorText>
      )}
    </form>
  );
}

// Left side of the row's status line: an amber chip when the client needs a
// nudge, plain text when they're active.
function StatusLabel({ quietDays }) {
  if (quietDays == null) return <Chip tone="warn">Never logged</Chip>;
  if (quietDays >= 3) return <Chip tone="warn">Quiet {quietDays}d</Chip>;
  if (quietDays === 0) return <span>Active today</span>;
  return <span>Active {quietDays}d ago</span>;
}

// Right side: "2/4 this week" plus one dot per program day. The count is
// capped at the program's days (six sessions on a four-day plan reads 4/4).
// An unfilled dot is neutral grey — a missed day is never marked red.
function AdherenceLabel({ adherence }) {
  const planned = adherence?.planned ?? 0;
  if (!planned) return <span>No program assigned</span>;
  const done = Math.min(Math.max(adherence?.done ?? 0, 0), planned);
  return (
    <span className={styles.adherence}>
      <span>
        {done}/{planned} this week
      </span>
      <span className={styles.dots} aria-hidden="true">
        {Array.from({ length: planned }, (_, i) => (
          <span key={i} className={i < done ? styles.dotFilled : styles.dot} />
        ))}
      </span>
    </span>
  );
}

// One triage row: avatar, name, 4-week weight sparkline, then the status and
// adherence line. Everything here arrives with the client list itself, so
// the row paints in one go with no per-row loading. The order is the
// server's — never sorted here.
function ClientRow({ client, expanded, onToggle, onRemove, onToast, removing = false }) {
  const weights = (client.weightSeries ?? []).map((w) => Number(w.weight));

  return (
    <div className={styles.clientRow}>
      <div className={styles.clientHead} onClick={onToggle}>
        <div className={styles.avatarSlot}>
          <Avatar name={client.displayName} size={36} />
        </div>
        <div className={styles.clientInfo}>
          <div className={styles.clientTop}>
            <div className={styles.clientName}>{client.displayName}</div>
            {weights.length >= 2 ? (
              <Sparkline values={weights} />
            ) : (
              <span className={styles.noWeighIns}>No weigh-ins yet</span>
            )}
          </div>
          <div className={styles.clientEmail}>{client.email}</div>
          <div className={styles.triageStats}>
            <StatusLabel quietDays={client.quietDays} />
            <AdherenceLabel adherence={client.adherence} />
          </div>
        </div>
        <div className={styles.rowActions}>
          <button
            type="button"
            className={styles.removeGhost}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            disabled={removing}
            aria-label={`End coaching with ${client.displayName}`}
          >
            ✕
          </button>
          <span className={styles.chevron}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>
      {expanded && <ClientDetail clientId={client.clientId} onToast={onToast} />}
    </div>
  );
}

export default function Clients() {
  const { data, isLoading, isError, refetch } = useClients();
  const requests = useCoachRequests();
  const createInvite = useCreateInvite();
  const removeClient = useRemoveClient();
  const toast = useToast();
  const [newCode, setNewCode] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [copied, setCopied] = useState(false);
  const [clientToRemove, setClientToRemove] = useState(null);

  function handleCreateInvite() {
    createInvite.mutate(undefined, {
      onSuccess: (result) => setNewCode(result.inviteCode),
    });
  }

  // Copying twice quickly restarts the timer instead of letting the first
  // one flip the label back early; the timer is dropped if the page closes.
  const copiedTimerRef = useRef(null);
  useEffect(() => () => window.clearTimeout(copiedTimerRef.current), []);

  async function copyCode(code) {
    try {
      await navigator.clipboard.writeText(code);
      // The button itself says "Copied" for a moment, then goes back.
      window.clearTimeout(copiedTimerRef.current);
      setCopied(true);
      copiedTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available — ignore
    }
  }

  const clients = data?.clients ?? [];
  const pendingInvites = data?.pendingInvites ?? [];
  const requestList = requests.data ?? [];
  // The card only exists while there's something to answer (or it's still
  // loading) — a busy coach's screen stays calm otherwise.
  const showRequests = requests.isLoading || requestList.length > 0;

  // The scoreboard only appears once there are real numbers to show — an
  // empty practice doesn't need three zeros above the "invite" card.
  const showSummary = !isLoading && !isError && clients.length > 0;
  const attentionCount = clients.filter(needsAttention).length;
  const onTrackCount = clients.filter(isOnTrack).length;

  return (
    <Screen title="Clients">
      {showSummary && (
        <div className={styles.summaryStrip}>
          <StatCard label="Clients" value={clients.length} />
          <StatCard
            label="Need attention"
            value={attentionCount}
            sub="Quiet 3+ days"
            subTone={attentionCount > 0 ? 'warn' : 'neutral'}
          />
          <StatCard
            label="On track"
            value={onTrackCount}
            sub="Hit their program"
            subTone={onTrackCount > 0 ? 'good' : 'neutral'}
          />
        </div>
      )}

      <Card className={styles.stackCard} title="Invite a client">
        {newCode && (
          <div className={styles.inviteCodeBox}>
            <span className={styles.inviteCode}>{newCode}</span>
            <Button variant="secondary" size="sm" onClick={() => copyCode(newCode)}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        )}
        <Button onClick={handleCreateInvite} disabled={createInvite.isPending}>
          {createInvite.isPending ? 'Generating...' : 'Generate invite code'}
        </Button>
        {createInvite.isError && <ErrorText>{createInvite.error.message}</ErrorText>}
        <p className={styles.hint}>Share this code with your client — they enter it under More.</p>

        <InviteByEmail onSent={(message) => toast.show(message)} />

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
                  disabled={removeClient.isPending}
                  aria-label="Remove invite"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {showRequests && (
        <Card className={styles.stackCard} title="Requests">
          {requests.isLoading ? (
            <Skeleton height="3.5rem" count={2} />
          ) : (
            requestList.map((request) => (
              <RequestRow key={request.id} request={request} onDone={(message) => toast.show(message)} />
            ))
          )}
        </Card>
      )}

      <Card className={styles.stackCard} title="Your clients">
        {isLoading ? (
          <Skeleton height="3.5rem" count={3} />
        ) : isError ? (
          <>
            <ErrorText>Couldn&apos;t load your clients — please try again.</ErrorText>
            <Button variant="secondary" onClick={() => refetch()}>
              Retry
            </Button>
          </>
        ) : clients.length === 0 ? (
          <EmptyState
            action={
              <Link className={styles.linkAsButton} to="/coach/profile">
                Set up your profile
              </Link>
            }
          >
            No clients yet. Send an invite code above, or set up your public profile so students can find
            you.
          </EmptyState>
        ) : (
          clients.map((client) => (
            <ClientRow
              key={client.linkId}
              client={client}
              expanded={expandedId === client.clientId}
              onToggle={() => setExpandedId((id) => (id === client.clientId ? null : client.clientId))}
              onRemove={() => setClientToRemove(client)}
              onToast={(message) => toast.show(message)}
              removing={removeClient.isPending}
            />
          ))
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(clientToRemove)}
        message={
          clientToRemove
            ? `End coaching with ${clientToRemove.displayName}? They'll keep all their own logged data and programs — only the coaching connection ends.`
            : ''
        }
        confirmLabel="End coaching"
        busy={removeClient.isPending}
        onConfirm={() => {
          // Stays open (with both buttons disabled) until the removal is
          // done, so a second tap can't remove the same client twice.
          removeClient.mutate(clientToRemove.linkId, {
            onSettled: () => setClientToRemove(null),
          });
        }}
        onCancel={() => setClientToRemove(null)}
      />

      <Toast message={toast.message} />
    </Screen>
  );
}
