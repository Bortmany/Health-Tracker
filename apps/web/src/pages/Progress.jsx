import { useState } from 'react';
import LineChart from '../components/LineChart.jsx';
import { Card, EmptyState, Screen, Skeleton, Tooltip } from '../components/ui/index.js';
import { useLogsRange } from '../hooks/useLogs.js';
import { useNutritionRange } from '../hooks/useNutrition.js';
import { usePersonalRecords, useTrainingLogs } from '../hooks/useTrainingLogs.js';
import { smoothSeries, trendCaption } from '../lib/trend.js';
import styles from './Progress.module.css';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function dateNDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ---- Month helpers for the consistency calendar ----

function firstOfMonthISO(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

function shiftMonth(monthISO, delta) {
  const [year, month] = monthISO.split('-').map(Number);
  return firstOfMonthISO(new Date(year, month - 1 + delta, 1));
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function ConsistencyCalendar() {
  const [monthStart, setMonthStart] = useState(() => firstOfMonthISO());
  const [year, month] = monthStart.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthEnd = `${monthStart.slice(0, 8)}${String(daysInMonth).padStart(2, '0')}`;
  // Weeks start on Monday: how many blank cells before day 1.
  const leadBlanks = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const { data: monthLogs = [], isLoading: monthLogsLoading } = useLogsRange({
    from: monthStart,
    to: monthEnd,
  });
  const { data: monthSessions = [], isLoading: monthSessionsLoading } = useTrainingLogs({
    from: monthStart,
    to: monthEnd,
  });

  const loggedDates = new Set(monthLogs.map((l) => l.date.slice(0, 10)));
  const trainedDates = new Set(monthSessions.map((s) => s.date.slice(0, 10)));
  const loading = monthLogsLoading || monthSessionsLoading;

  function cellClass(dateISO) {
    const logged = loggedDates.has(dateISO);
    const trained = trainedDates.has(dateISO);
    if (logged && trained) return `${styles.dayCell} ${styles.dayFull}`;
    if (logged) return `${styles.dayCell} ${styles.dayLogged}`;
    return `${styles.dayCell} ${styles.dayEmpty}`;
  }

  return (
    <Card title="Consistency">
      <div className={styles.calHeader}>
        <Tooltip label="Previous month">
          <button
            type="button"
            className={styles.calNavButton}
            onClick={() => setMonthStart((m) => shiftMonth(m, -1))}
            aria-label="Previous month"
          >
            ←
          </button>
        </Tooltip>
        <span className={styles.calMonthLabel}>{monthLabel}</span>
        <Tooltip label="Next month">
          <button
            type="button"
            className={styles.calNavButton}
            onClick={() => setMonthStart((m) => shiftMonth(m, 1))}
            aria-label="Next month"
          >
            →
          </button>
        </Tooltip>
      </div>

      <div className={styles.calGrid}>
        {WEEKDAYS.map((w, i) => (
          <span key={`wd-${i}`} className={styles.calWeekday}>
            {w}
          </span>
        ))}
        {loading
          ? Array.from({ length: 42 }, (_, i) => (
              <Skeleton key={`sk-${i}`} height="auto" style={{ aspectRatio: '1' }} />
            ))
          : [
              ...Array.from({ length: leadBlanks }, (_, i) => (
                <span key={`blank-${i}`} className={styles.dayBlank} />
              )),
              ...Array.from({ length: daysInMonth }, (_, i) => {
                const dateISO = `${monthStart.slice(0, 8)}${String(i + 1).padStart(2, '0')}`;
                return (
                  <span key={dateISO} className={cellClass(dateISO)}>
                    {i + 1}
                  </span>
                );
              }),
            ]}
      </div>

      {!loading && loggedDates.size === 0 && (
        <p className={styles.calCaption}>
          No days logged this month yet — every log fills in a square.
        </p>
      )}
      <p className={styles.calLegend}>
        Bright = logged + trained · Faded = logged · Outline = not yet
      </p>
    </Card>
  );
}

export default function Progress() {
  const today = todayISO();
  const from = dateNDaysAgo(59);
  const { data: logs = [], isLoading: logsLoading } = useLogsRange({ from, to: today });
  const { data: nutritionLogs = [], isLoading: nutritionLoading } = useNutritionRange({ from, to: today });
  const { data: records = [], isLoading: recordsLoading } = usePersonalRecords();

  const weighIns = logs
    .filter((l) => l.weight != null)
    .map((l) => ({ date: l.date, weight: Number(l.weight) }));
  const smoothed = smoothSeries(weighIns.map((w) => w.weight));
  const caption = trendCaption(weighIns, smoothed);
  const calorieDays = nutritionLogs.filter((l) => l.calories != null);

  return (
    <Screen title="Progress">
      <div className={styles.stack}>
        <Card title="Weight — last 60 days">
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
            <EmptyState>Nothing to chart yet — weigh-ins you log will show up here.</EmptyState>
          )}
        </Card>

        <Card title="Calories eaten — last 60 days">
          {nutritionLoading ? (
            <Skeleton height={160} />
          ) : calorieDays.length > 0 ? (
            <LineChart
              labels={calorieDays.map((l) => l.date.slice(5, 10))}
              values={calorieDays.map((l) => l.calories)}
              color="--color-chart-line-2"
            />
          ) : (
            <EmptyState>
              No food logged yet — log a few days and your calorie trend will appear here.
            </EmptyState>
          )}
        </Card>

        <ConsistencyCalendar />

        <Card title="Personal records">
          {recordsLoading ? (
            <Skeleton height="2.5rem" count={3} />
          ) : records.length > 0 ? (
            records.slice(0, 10).map((r, i) => (
              <div className={styles.recordRow} key={`${r.name}-${i}`}>
                <div>
                  <p className={styles.recordName}>{r.name}</p>
                  <p className={styles.recordDate}>{r.date.slice(0, 10)}</p>
                </div>
                <span className={styles.recordValue}>
                  {r.weight} kg × {r.reps}
                </span>
              </div>
            ))
          ) : (
            <EmptyState>Log some weighted sets and your best lifts will land here.</EmptyState>
          )}
        </Card>
      </div>
    </Screen>
  );
}
