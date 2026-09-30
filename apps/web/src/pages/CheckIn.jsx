import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorText,
  Field,
  Screen,
  Skeleton,
  TextArea,
} from '../components/ui/index.js';
import { useCurrentCheckin, useSaveCheckin } from '../hooks/useCheckins.js';
import {
  ANSWER_COUNTER_FROM,
  ANSWER_MAX,
  initialForm,
  isFormDirty,
  isRateLimited,
  MOODS,
  NOTE_COUNTER_FROM,
  NOTE_MAX,
  toCheckinBody,
} from '../lib/checkin.js';
import { dayOfMoment, formatShortDay } from '../lib/localDate.js';
import styles from './CheckIn.module.css';

function BackToToday() {
  return (
    <Link className={styles.backLink} to="/">
      ← Today
    </Link>
  );
}

function NoCoach() {
  return (
    <EmptyState
      action={
        <Link className={styles.linkAsButton} to="/more">
          Go to More
        </Link>
      }
    >
      Check-ins go to your coach, and you don&apos;t have one right now.
    </EmptyState>
  );
}

// "123/500" under a box once it's nearly full; red only at the cap.
function Counter({ length, max, from }) {
  if (length < from) return null;
  return (
    <div className={length >= max ? styles.counterOver : styles.counter} aria-live="polite">
      {length}/{max}
    </div>
  );
}

// Five round buttons, one radio group: arrow keys move the choice, and only
// the chosen one (or the first, before a choice) sits in the tab order.
function MoodPicker({ value, onChange }) {
  const refs = useRef([]);

  function handleKeyDown(e, index) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + MOODS.length) % MOODS.length;
    onChange(MOODS[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div className={styles.moodRow} role="radiogroup" aria-label="How did your week feel?">
      {MOODS.map((mood, i) => {
        const selected = value === mood.value;
        const focusable = selected || (value == null && i === 0);
        return (
          <div className={styles.moodOption} key={mood.value}>
            <button
              type="button"
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="radio"
              aria-checked={selected}
              aria-label={`${mood.value}, ${mood.label}`}
              tabIndex={focusable ? 0 : -1}
              className={selected ? styles.moodSelected : styles.moodButton}
              onClick={() => onChange(mood.value)}
              onKeyDown={(e) => handleKeyDown(e, i)}
            >
              {mood.value}
            </button>
            <span className={styles.moodWord} aria-hidden="true">
              {mood.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// The form itself, started fresh from this week's saved check-in (if any).
function CheckinForm({ data, notice, onQuestionsChanged }) {
  const navigate = useNavigate();
  const save = useSaveCheckin();
  const questions = data.questions ?? [];
  const existing = data.checkin ?? null;
  // Where the form started: fixed for this form's life (a new saved copy or a
  // new week mounts a fresh form, see the key below).
  const [start] = useState(() => initialForm(questions, existing));
  const [draft, setDraft] = useState(start);
  const [linkEnded, setLinkEnded] = useState(false);

  const editing = Boolean(existing);
  const dirty = isFormDirty(start, draft);
  const canSend = draft.mood != null && (!editing || dirty) && !save.isPending;

  function setAnswer(index, text) {
    setDraft((d) => ({ ...d, answers: d.answers.map((a, i) => (i === index ? text.slice(0, ANSWER_MAX) : a)) }));
  }

  function submit() {
    if (!canSend) return;
    save.mutate(toCheckinBody(draft, questions), {
      onSuccess: () => navigate('/', { state: { toast: editing ? 'Check-in updated' : 'Sent to your coach' } }),
      onError: (error) => {
        if (error?.code === 'NO_COACH') setLinkEnded(true);
        if (error?.code === 'QUESTIONS_CHANGED') onQuestionsChanged?.();
      },
    });
  }

  // Ctrl/Cmd + Enter in any text box sends; plain Enter just adds a line.
  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  }

  if (linkEnded) return <NoCoach />;

  const sentDay = dayOfMoment(existing?.submittedAt);
  const coachName = data.coachName || 'your coach';

  return (
    <div className={styles.stack} onKeyDown={handleKeyDown}>
      <p className={styles.meta}>
        Week of {formatShortDay(data.weekStart)} · goes to {coachName}
      </p>

      {editing && (
        <div className={styles.sentBlock}>
          <Chip>Sent {formatShortDay(sentDay)}</Chip>
          <p className={styles.meta}>You can change your answers until the end of Sunday.</p>
        </div>
      )}

      <Card title="How did your week feel?">
        <MoodPicker value={draft.mood} onChange={(mood) => setDraft((d) => ({ ...d, mood }))} />
      </Card>

      {questions.length > 0 && (
        <Card title="Your coach's questions">
          <div className={styles.questions}>
            {questions.map((question, i) => (
              <div key={`${i}-${question}`}>
                <Field label={question}>
                  <TextArea
                    rows={3}
                    maxLength={ANSWER_MAX}
                    placeholder="Type your answer"
                    value={draft.answers[i] ?? ''}
                    onChange={(e) => setAnswer(i, e.target.value)}
                  />
                </Field>
                <Counter length={(draft.answers[i] ?? '').length} max={ANSWER_MAX} from={ANSWER_COUNTER_FROM} />
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Anything else?">
        <Field label="Note for your coach (optional)">
          <TextArea
            rows={3}
            maxLength={NOTE_MAX}
            placeholder="A win, a worry, anything at all"
            value={draft.notes}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value.slice(0, NOTE_MAX) }))}
          />
        </Field>
        <Counter length={draft.notes.length} max={NOTE_MAX} from={NOTE_COUNTER_FROM} />
      </Card>

      <div className={styles.submitBlock}>
        {notice && <ErrorText>{notice}</ErrorText>}
        {save.isError && save.error?.code !== 'QUESTIONS_CHANGED' &&
          (isRateLimited(save.error) ? (
            <ErrorText>You&apos;re sending a lot right now. Please wait a minute and try again.</ErrorText>
          ) : (
            <ErrorText>Couldn&apos;t send your check-in. Your answers are still here, so just try again.</ErrorText>
          ))}
        <Button block onClick={submit} disabled={!canSend}>
          {save.isPending ? 'Sending...' : editing ? 'Update check-in' : 'Send check-in'}
        </Button>
        {draft.mood == null && <p className={styles.meta}>Pick how your week felt to send it.</p>}
        <p className={styles.meta}>Only your coach sees this.</p>
      </div>
    </div>
  );
}

export default function CheckIn() {
  const current = useCurrentCheckin();
  const [notice, setNotice] = useState('');

  let body;
  if (current.isLoading) {
    body = (
      <div className={styles.stack}>
        <Skeleton height={72} />
        <Skeleton height={88} count={3} />
        <Skeleton height={48} />
      </div>
    );
  } else if (current.isError) {
    body = (
      <div className={styles.errorBlock}>
        <ErrorText>Couldn&apos;t load this week&apos;s check-in.</ErrorText>
        <Button variant="secondary" size="sm" onClick={() => current.refetch()}>
          Retry
        </Button>
      </div>
    );
  } else if (!current.data?.hasCoach) {
    body = <NoCoach />;
  } else {
    const data = current.data;
    // A fresh form whenever the saved check-in or the week changes underneath it.
    // The questions are part of the key too, so a coach's edit gives a form
    // built on the new list (answers are filed by position).
    body = (
      <CheckinForm
        key={`${data.weekStart}-${data.checkin?.updatedAt ?? 'new'}-${JSON.stringify(data.questions ?? [])}`}
        data={data}
        notice={notice}
        onQuestionsChanged={() =>
          setNotice('Your coach just changed their questions. Please check the form and send again.')
        }
      />
    );
  }

  return (
    <Screen title="Weekly check-in" label={<BackToToday />}>
      {body}
    </Screen>
  );
}
