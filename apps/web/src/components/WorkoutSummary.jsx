import { Button, Chip, Skeleton } from './ui/index.js';
import { useStreak } from '../hooks/useLogs.js';
import { usePersonalRecords } from '../hooks/useTrainingLogs.js';
import styles from './WorkoutSummary.module.css';

// Shown right after a new session is saved: what was just done, anything
// that beat a previous best, the current streak, and what's next. Works the
// same for a program day and for a session logged out of the blue.

function sessionTotals(session) {
  const exercises = session.exercises.filter((ex) => ex.name);
  let setCount = 0;
  let volume = 0;
  for (const exercise of exercises) {
    for (const set of exercise.sets) {
      // Only count a set that actually had something written down.
      if (set.weight == null && set.reps == null) continue;
      setCount += 1;
      if (set.weight != null && set.reps != null) volume += set.weight * set.reps;
    }
  }
  return { exerciseCount: exercises.length, setCount, volume: Math.round(volume) };
}

// A best is "new" when this session included that exercise and the record
// now standing is heavier than the one on file before the save.
function newRecords(session, previousRecords, records) {
  const doneToday = new Set(session.exercises.filter((ex) => ex.name).map((ex) => ex.name.toLowerCase()));
  const before = new Map((previousRecords ?? []).map((r) => [r.name.toLowerCase(), Number(r.weight)]));
  return (records ?? []).filter((r) => {
    if (!doneToday.has(r.name.toLowerCase())) return false;
    const previousBest = before.get(r.name.toLowerCase());
    return previousBest == null || Number(r.weight) > previousBest;
  });
}

export default function WorkoutSummary({ session, previousRecords, nextDayName = null, onDone }) {
  const { data: records, isLoading: recordsLoading } = usePersonalRecords();
  const { data: streak, isLoading: streakLoading } = useStreak();

  const { exerciseCount, setCount, volume } = sessionTotals(session);
  const beaten = recordsLoading ? [] : newRecords(session, previousRecords, records);

  return (
    <div className={styles.overlay}>
      <div className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="workout-summary-title">
        <h2 className={styles.title} id="workout-summary-title">
          Session saved
        </h2>

        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statValue}>{volume}</span>
            <span className={styles.statLabel}>kg lifted</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{setCount}</span>
            <span className={styles.statLabel}>{setCount === 1 ? 'set' : 'sets'}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{exerciseCount}</span>
            <span className={styles.statLabel}>{exerciseCount === 1 ? 'exercise' : 'exercises'}</span>
          </div>
        </div>
        {volume === 0 && (
          <p className={styles.note}>
            No weights in this one — add kilos and reps to a set and the total shows up here.
          </p>
        )}

        <div className={styles.block}>
          {recordsLoading ? (
            <Skeleton height="1.5rem" count={2} />
          ) : beaten.length > 0 ? (
            <>
              <p className={styles.blockTitle}>New personal best</p>
              {beaten.map((r) => (
                <div className={styles.recordRow} key={r.name}>
                  <span>{r.name}</span>
                  <Chip tone="accent">
                    {r.weight} kg × {r.reps}
                  </Chip>
                </div>
              ))}
            </>
          ) : (
            <p className={styles.note}>No new bests today — showing up still counts.</p>
          )}
        </div>

        <div className={styles.block}>
          {streakLoading ? (
            <Skeleton height="1.5rem" />
          ) : streak > 0 ? (
            <p className={styles.streak}>
              {streak} {streak === 1 ? 'day' : 'days'} logged in a row.
            </p>
          ) : (
            <p className={styles.note}>Log today on the Today screen to start a streak.</p>
          )}
        </div>

        {nextDayName && <p className={styles.next}>Next up in your program: {nextDayName}.</p>}

        <Button block onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
