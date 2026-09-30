import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Button,
  ConfirmDialog,
  ErrorText,
  Field,
  Input,
  Screen,
  Skeleton,
  Toast,
  useToast,
} from '../components/ui/index.js';
import { useCheckinQuestions, useSaveCheckinQuestions } from '../hooks/useCheckins.js';
import {
  blankQuestionRows,
  DEFAULT_QUESTIONS,
  isRateLimited,
  QUESTION_MAX,
  QUESTIONS_MAX,
  QUESTIONS_MIN,
  questionsChanged,
} from '../lib/checkin.js';
import styles from './CheckinQuestions.module.css';

let rowCounter = 0;
function toRows(questions) {
  return questions.map((text) => ({ key: `q-${(rowCounter += 1)}`, text }));
}

// "← Clients". With unsaved edits it asks first instead of leaving.
function BackToClients({ blocked = false, onBlocked }) {
  return (
    <Link
      className={styles.backLink}
      to="/clients"
      onClick={(e) => {
        if (!blocked) return;
        e.preventDefault();
        onBlocked();
      }}
    >
      ← Clients
    </Link>
  );
}

// The screen while the list is loading or couldn't load.
function Placeholder({ children }) {
  return (
    <Screen title="Check-in questions" label={<BackToClients />}>
      {children}
    </Screen>
  );
}

// The editor, started from the coach's saved list. Keeps its own draft until
// Save; nothing reaches clients before then.
function QuestionEditor({ saved }) {
  const navigate = useNavigate();
  const save = useSaveCheckinQuestions();
  const toast = useToast(3000);
  const [baseline, setBaseline] = useState(saved);
  const [rows, setRows] = useState(() => toRows(saved));
  const [showErrors, setShowErrors] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const texts = rows.map((r) => r.text);
  const blanks = blankQuestionRows(texts);
  const dirty = questionsChanged(baseline, texts);
  const atMax = rows.length >= QUESTIONS_MAX;

  // Closing or reloading the tab with unsaved edits asks the browser's own question.
  useEffect(() => {
    if (!dirty) return undefined;
    function warn(e) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function update(key, text) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, text: text.slice(0, QUESTION_MAX) } : r)));
  }

  function remove(key) {
    setRows((rs) => (rs.length <= QUESTIONS_MIN ? rs : rs.filter((r) => r.key !== key)));
  }

  function add() {
    setRows((rs) => (rs.length >= QUESTIONS_MAX ? rs : [...rs, ...toRows([''])]));
  }

  function handleSave() {
    if (!dirty || save.isPending) return;
    if (blanks.length > 0) {
      setShowErrors(true);
      return;
    }
    const questions = texts.map((t) => t.trim());
    save.mutate(questions, {
      onSuccess: (result) => {
        const kept = Array.isArray(result?.questions) ? result.questions : questions;
        setBaseline(kept);
        setRows(toRows(kept));
        setShowErrors(false);
        toast.show('Questions saved. Clients see them from their next check-in.');
      },
    });
  }

  let saveError = null;
  if (showErrors && blanks.length > 0) {
    saveError = 'Please fix the highlighted questions.';
  } else if (save.isError) {
    saveError = isRateLimited(save.error)
      ? "You're saving a lot right now. Please wait a minute and try again."
      : save.error?.status === 400 && save.error.message
        ? save.error.message
        : "Couldn't save your questions. Please try again.";
  }

  return (
    <Screen
      title="Check-in questions"
      label={<BackToClients blocked={dirty} onBlocked={() => setConfirmLeave(true)} />}
      actions={
        <Button onClick={handleSave} disabled={!dirty || save.isPending}>
          {save.isPending ? 'Saving...' : 'Save'}
        </Button>
      }
    >
      <div className={styles.stack}>
        <p className={styles.muted}>
          Your clients answer these every week. Mood (1 to 5) and a free note are always included.
        </p>

        {saveError && <ErrorText>{saveError}</ErrorText>}

        <ol className={styles.list}>
          {rows.map((row, i) => {
            const blank = showErrors && row.text.trim() === '';
            const onlyOne = rows.length <= QUESTIONS_MIN;
            const removeHint = onlyOne ? 'You need at least one question' : 'Remove this question';
            return (
              <li className={styles.row} key={row.key}>
                <span className={styles.number} aria-hidden="true">
                  {i + 1}
                </span>
                <div className={styles.field}>
                  <Field error={blank ? 'Write the question, or remove this row.' : ''}>
                    <Input
                      value={row.text}
                      maxLength={QUESTION_MAX}
                      placeholder="For example: How did your training feel this week?"
                      aria-label={`Question ${i + 1}`}
                      aria-invalid={blank ? 'true' : undefined}
                      onChange={(e) => update(row.key, e.target.value)}
                    />
                  </Field>
                </div>
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => remove(row.key)}
                  disabled={onlyOne}
                  title={removeHint}
                  aria-label={removeHint}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ol>

        <div className={styles.addBlock}>
          <Button variant="ghost" block onClick={add} disabled={atMax}>
            + Add a question
          </Button>
          {atMax && <p className={styles.muted}>You can have up to 8 questions.</p>}
        </div>

        <div>
          <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)}>
            Reset to the standard four
          </Button>
        </div>

        <p className={styles.muted}>
          Changes apply to check-ins from now on. Answers already sent keep the question they were asked.
        </p>
      </div>

      <ConfirmDialog
        open={confirmReset}
        message="Replace your questions with the standard four? Your current list will be lost."
        confirmLabel="Reset"
        onConfirm={() => {
          setRows(toRows(DEFAULT_QUESTIONS));
          setShowErrors(false);
          setConfirmReset(false);
          toast.show('Questions reset. Tap Save to keep them.');
        }}
        onCancel={() => setConfirmReset(false)}
      />

      <ConfirmDialog
        open={confirmLeave}
        message="Leave without saving? Your changes will be lost."
        confirmLabel="Leave"
        onConfirm={() => {
          setConfirmLeave(false);
          navigate('/clients');
        }}
        onCancel={() => setConfirmLeave(false)}
      />

      <Toast message={toast.message} />
    </Screen>
  );
}

export default function CheckinQuestions() {
  const questions = useCheckinQuestions();
  const saved = questions.data ?? [];

  if (questions.isLoading) {
    return (
      <Placeholder>
        <Skeleton height={48} count={4} />
      </Placeholder>
    );
  }

  // Defaults are seeded, so an empty list means something went wrong.
  if (questions.isError || saved.length === 0) {
    return (
      <Placeholder>
        <div className={styles.errorBlock}>
          <ErrorText>Couldn&apos;t load your questions.</ErrorText>
          <Button variant="secondary" size="sm" onClick={() => questions.refetch()}>
            Retry
          </Button>
        </div>
      </Placeholder>
    );
  }

  return <QuestionEditor saved={saved} />;
}
