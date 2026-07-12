import { useNavigate } from 'react-router-dom';
import LineChart from '../components/LineChart.jsx';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ProgressRing,
  Screen,
  Skeleton,
  StatCard,
} from '../components/ui/index.js';
import { useMe } from '../hooks/useAuth.js';
import { useHabits } from '../hooks/useHabits.js';
import { useHabitSummary, useLogsRange, useStreak } from '../hooks/useLogs.js';
import { useMyPlan } from '../hooks/usePlans.js';
import { useProgram } from '../hooks/usePrograms.js';
import { useSettings } from '../hooks/useSettings.js';
import { useTrainingLog, useTrainingLogs } from '../hooks/useTrainingLogs.js';
import { smoothSeries, trendCaption } from '../lib/trend.js';
import styles from './Dashboard.module.css';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function dateNDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function diffDays(a, b) {
  const ms = new Date(`${a}T00:00:00`) - new Date(`${b}T00:00:00`);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

// Quick-log shortcuts: each lands on the Log screen with that field focused.
const QUICK_LOGS = [
  { label: '+ Weight', focus: 'weight' },
  { label: '+ Sleep', focus: 'sleep' },
  { label: '+ Meal', focus: 'meal' },
  { label: '+ Steps', focus: 'steps' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: user } = useMe();
  const { data: settings } = useSettings();
  const today = todayISO();
  const from = dateNDaysAgo(29);
  const { data: logs = [], isLoading: logsLoading } = useLogsRange({ from, to: today });

  const { data: habitDays = [] } = useHabitSummary({ from: dateNDaysAgo(6), to: today });
  const { data: activeHabits = [] } = useHabits();
  const { data: streak, isLoading: streakLoading } = useStreak();

  // Hero data: the active plan, its program (for day names), and sessions
  // logged since the plan started (to find today's session and the next day).
  const { data: plan, isLoading: planLoading } = useMyPlan();
  const { data: sessions = [], isLoading: sessionsLoading } = useTrainingLogs({
    from: plan?.startDate ?? today,
    to: today,
  });
  const { data: program } = useProgram(plan?.programId);
  const todaySession = sessions.find((s) => s.date.slice(0, 10) === today) ?? null;
  const { data: todaySessionDetail } = useTrainingLog(todaySession?.id);

  const weighIns = logs
    .filter((l) => l.weight != null)
    .map((l) => ({ date: l.date, weight: Number(l.weight) }));
  const currentWeight = weighIns.at(-1)?.weight ?? null;
  const smoothed = smoothSeries(weighIns.map((w) => w.weight));
  const caption = trendCaption(weighIns, smoothed);

  const daysToTarget = settings?.targetDate ? diffDays(settings.targetDate, today) : null;

  // Every active habit counts for all 7 days, so days you didn't log count as misses.
  const completed = habitDays.reduce((sum, d) => sum + d.completed, 0);
  const possible = activeHabits.length * 7;
  const compliancePct = possible > 0 ? Math.round((completed / possible) * 100) : null;

  // The next program day: one past the most recent session logged against
  // this program, wrapping back to the first day at the end.
  function nextDay() {
    if (!program?.days?.length) return null;
    const lastForProgram = sessions.find(
      (s) => s.programId === plan?.programId && s.programDayId != null
    );
    if (!lastForProgram) return program.days[0];
    const idx = program.days.findIndex((d) => d.id === lastForProgram.programDayId);
    if (idx === -1) return program.days[0];
    return program.days[(idx + 1) % program.days.length];
  }

  function startSessionUrl() {
    const day = nextDay();
    const dayParam = day ? `&day=${day.id}` : '';
    return `/train?program=${plan.programId}${dayParam}`;
  }

  function renderHero() {
    if (planLoading || (plan && sessionsLoading)) {
      return <Skeleton height={120} />;
    }
    if (!plan) {
      return (
        <Card title="Today's session">
          <EmptyState
            action={<Button onClick={() => navigate('/train')}>Find a plan</Button>}
          >
            No plan running yet. A few taps and you'll have one built around your goals.
          </EmptyState>
        </Card>
      );
    }
    if (plan.completed) {
      return (
        <Card title="Today's session">
          <p className={styles.heroName}>Plan complete — nice work.</p>
          <div className={styles.heroAction}>
            <Button variant="secondary" onClick={() => navigate('/train')}>
              Choose a new plan
            </Button>
          </div>
        </Card>
      );
    }
    if (todaySession) {
      const exerciseCount = todaySessionDetail?.exercises?.length ?? null;
      const summary =
        todaySession.notes ||
        (exerciseCount != null
          ? `${exerciseCount} exercise${exerciseCount === 1 ? '' : 's'} logged`
          : null);
      return (
        <Card title="Today's session">
          <p className={styles.heroName}>Session logged today</p>
          {summary && <p className={styles.heroMeta}>{summary}</p>}
          <div className={styles.heroAction}>
            <Button onClick={() => navigate(`/train?edit=${todaySession.id}`)}>
              Continue / edit today's session
            </Button>
          </div>
        </Card>
      );
    }
    const day = nextDay();
    return (
      <Card title="Today's session">
        <div className={styles.heroTitleRow}>
          <p className={styles.heroName}>{plan.name}</p>
          {plan.deload && <Chip tone="accent">Easy week</Chip>}
        </div>
        <p className={styles.heroMeta}>
          Week {plan.weekNumber} of {plan.durationWeeks}
        </p>
        {day && <p className={styles.heroNext}>Next up: {day.name}</p>}
        {plan.guidance && <p className={styles.heroGuidance}>{plan.guidance}</p>}
        <div className={styles.heroAction}>
          <Button onClick={() => navigate(startSessionUrl())}>Start session</Button>
        </div>
      </Card>
    );
  }

  return (
    <Screen
      title={
        <>
          Hey, <span className={styles.greetingDim}>{user?.displayName ?? '...'}</span>
        </>
      }
    >
      <div className={styles.stack}>
        {renderHero()}

        <div className={styles.quickRow}>
          {QUICK_LOGS.map(({ label, focus }) => (
            <Button key={focus} variant="ghost" size="sm" onClick={() => navigate(`/log?focus=${focus}`)}>
              {label}
            </Button>
          ))}
        </div>

        {logsLoading || streakLoading ? (
          <div className={styles.statRow}>
            <Skeleton height={88} />
            <Skeleton height={88} />
            <Skeleton height={88} />
          </div>
        ) : (
          <div className={styles.statRow}>
            <StatCard
              label="Current weight"
              value={currentWeight != null ? `${currentWeight} kg` : '—'}
              sub={caption ?? 'Log a couple more weigh-ins to see a trend'}
            />
            <StatCard
              label="Streak"
              value={`${streak ?? 0} day${streak === 1 ? '' : 's'}`}
              sub="days in a row with a log"
            />
            <StatCard
              label="Days to target"
              value={daysToTarget != null ? Math.max(daysToTarget, 0) : '—'}
              sub={
                settings?.targetWeight != null
                  ? `Target ${settings.targetWeight} kg`
                  : 'Set a target in More'
              }
            />
          </div>
        )}

        <Card title="Weekly habits">
          <div className={styles.ringRow}>
            <ProgressRing percent={compliancePct ?? 0} size={80}>
              {compliancePct == null ? '' : undefined}
            </ProgressRing>
            <p className={styles.ringMeta}>
              {possible > 0
                ? `${completed} of ${possible} habit checks this week`
                : "No habits tracked yet — add one or two in More and they'll show up here."}
            </p>
          </div>
        </Card>

        <Card title="Weight trend — last 30 days">
          {logsLoading ? (
            <Skeleton height={160} />
          ) : weighIns.length > 0 ? (
            <>
              <LineChart
                labels={weighIns.map((w) => w.date.slice(5, 10))}
                values={smoothed}
                rawValues={weighIns.map((w) => w.weight)}
              />
              {caption && <p className={styles.chartCaption}>{caption}</p>}
            </>
          ) : (
            <EmptyState>
              No weigh-ins in the last 30 days — log one anytime, no pressure on the number.
            </EmptyState>
          )}
        </Card>
      </div>
    </Screen>
  );
}
