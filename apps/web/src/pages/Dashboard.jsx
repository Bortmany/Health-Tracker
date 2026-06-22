import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import * as logsApi from '../api/logs.js';
import LineChart from '../components/LineChart.jsx';
import { useMe } from '../hooks/useAuth.js';
import { useLogsRange } from '../hooks/useLogs.js';
import { useSettings } from '../hooks/useSettings.js';
import styles from './Dashboard.module.css';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function dateNDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function lastNDates(n) {
  return Array.from({ length: n }, (_, i) => dateNDaysAgo(n - 1 - i));
}

function diffDays(a, b) {
  const ms = new Date(`${a}T00:00:00`) - new Date(`${b}T00:00:00`);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export default function Dashboard() {
  const { data: user } = useMe();
  const { data: settings } = useSettings();
  const today = todayISO();
  const from = dateNDaysAgo(29);
  const { data: logs = [], isLoading: logsLoading } = useLogsRange({ from, to: today });

  const last7 = useMemo(() => lastNDates(7), []);
  const weekQueries = useQueries({
    queries: last7.map((date) => ({
      queryKey: ['log', date],
      queryFn: () => logsApi.getLog(date),
    })),
  });

  const weighIns = logs.filter((l) => l.weight != null);
  const currentWeight = weighIns.at(-1)?.weight ?? null;
  const previousWeight = weighIns.at(-2)?.weight ?? null;
  const trend = currentWeight != null && previousWeight != null ? currentWeight - previousWeight : null;

  const daysToTarget = settings?.targetDate ? diffDays(settings.targetDate, today) : null;

  const weekLoaded = weekQueries.every((q) => q.isSuccess);
  let completed = 0;
  let possible = 0;
  if (weekLoaded) {
    for (const q of weekQueries) {
      for (const h of q.data.habits) {
        possible += 1;
        if (h.completed) completed += 1;
      }
    }
  }
  const compliancePct = possible > 0 ? Math.round((completed / possible) * 100) : null;

  function trendClass() {
    if (trend == null || trend === 0) return styles.trendFlat;
    return trend > 0 ? styles.trendUp : styles.trendDown;
  }

  function trendLabel() {
    if (trend == null) return 'no trend yet';
    const sign = trend > 0 ? '+' : '';
    return `${sign}${trend.toFixed(1)} kg`;
  }

  return (
    <div className={styles.screen}>
      <h1 className={styles.greeting}>
        Hey, <span className={styles.greetingDim}>{user?.displayName ?? '...'}</span>
      </h1>

      <div className={styles.cardsGrid}>
        <div className={styles.card}>
          <p className={styles.cardLabel}>Current weight</p>
          {logsLoading ? (
            <div className="skeleton" style={{ height: 28, width: '60%' }} />
          ) : (
            <>
              <p className={styles.cardValue}>{currentWeight != null ? `${currentWeight} kg` : '—'}</p>
              <p className={`${styles.cardSub} ${trendClass()}`}>{trendLabel()}</p>
            </>
          )}
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>Days to target</p>
          <p className={styles.cardValue}>{daysToTarget != null ? Math.max(daysToTarget, 0) : '—'}</p>
          <p className={styles.cardSub} style={{ color: 'var(--text-dim)' }}>
            {settings?.targetWeight != null ? `target ${settings.targetWeight} kg` : 'set a target in More'}
          </p>
        </div>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Today's session</h2>
        <div className={styles.sessionRow}>
          <p className={styles.sessionEmpty}>Training plans land in Phase 4 — nothing scheduled yet.</p>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Weekly habit compliance</h2>
        <div className={styles.ringRow}>
          <div
            className={styles.ring}
            style={{
              background:
                compliancePct != null
                  ? `conic-gradient(var(--accent) ${compliancePct * 3.6}deg, var(--border) 0deg)`
                  : 'var(--border)',
            }}
          >
            <div className={styles.ringInner}>{compliancePct != null ? `${compliancePct}%` : '—'}</div>
          </div>
          <p className={styles.ringMeta}>
            {possible > 0 ? `${completed} of ${possible} habit checks this week` : 'No habits tracked yet'}
          </p>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Weight trend</h2>
        {logsLoading ? (
          <div className="skeleton" style={{ height: 160 }} />
        ) : weighIns.length > 0 ? (
          <LineChart
            labels={weighIns.map((l) => l.date.slice(5, 10))}
            values={weighIns.map((l) => l.weight)}
          />
        ) : (
          <div className={styles.chartStub}>No weigh-ins in the last 30 days yet</div>
        )}
      </section>
    </div>
  );
}
