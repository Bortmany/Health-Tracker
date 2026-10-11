import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import LineChart from './LineChart.jsx';
import { Button, ChipToggle, EmptyState, ErrorText, Skeleton } from './ui/index.js';
import { formatShortDay } from '../lib/localDate.js';
import {
  MEASUREMENTS,
  defaultMeasurement,
  emptyMeasurementText,
  formatCm,
  measurementCaption,
  seriesFor,
} from '../lib/measurements.js';
import styles from './MeasurementsChart.module.css';

// Inside a Card the global skeleton grey matches the Card, so lift it.
const IN_CARD_SKELETON = { background: 'var(--color-surface-2)' };

// Body measurements: pick one (Waist, Chest, ...), see its latest value, a
// plain line over time and one honest caption. Used on Progress (the
// student's own) and in the coach's client summary (`personName` set).
// The parent supplies the Card or section title around it.
export default function MeasurementsChart({
  measurements,
  isLoading = false,
  isError = false,
  onRetry,
  height = 160,
  personName = null,
}) {
  const [picked, setPicked] = useState(null);
  const list = Array.isArray(measurements) ? measurements : [];
  const selected = picked ?? defaultMeasurement(list);
  const series = useMemo(() => seriesFor(list, selected), [list, selected]);
  const labels = useMemo(() => series.map((e) => formatShortDay(e.date)), [series]);
  const values = useMemo(() => series.map((e) => e.value), [series]);
  const isCoachView = Boolean(personName);

  if (isLoading) {
    return (
      <div className={styles.body}>
        <Skeleton height={36} style={IN_CARD_SKELETON} />
        <Skeleton height={height} style={IN_CARD_SKELETON} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.body}>
        <ErrorText>
          {isCoachView ? "Couldn't load these measurements." : "Couldn't load your measurements."}
        </ErrorText>
        <div>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // The coach sees one quiet line when there's nothing at all.
  if (isCoachView && list.length === 0) {
    return <p className={styles.muted}>{personName} hasn&apos;t logged any measurements yet.</p>;
  }

  const label = MEASUREMENTS.find((m) => m.key === selected)?.label ?? '';
  const latest = series[series.length - 1] ?? null;
  const caption = measurementCaption(series);

  return (
    <div className={styles.body}>
      <div className={styles.chips} role="group" aria-label="Choose a measurement">
        {MEASUREMENTS.map((m) => (
          <ChipToggle key={m.key} selected={m.key === selected} onToggle={() => setPicked(m.key)}>
            {m.label}
          </ChipToggle>
        ))}
      </div>

      {series.length === 0 ? (
        isCoachView ? (
          <p className={styles.muted}>
            {personName} hasn&apos;t logged any {label.toLowerCase()} measurements yet.
          </p>
        ) : (
          <EmptyState action={<Link className={styles.logLink} to="/log">Go to Log</Link>}>
            {emptyMeasurementText(selected)}
          </EmptyState>
        )
      ) : (
        <>
          <div className={styles.latestRow}>
            <span className={styles.latestDate}>{formatShortDay(latest.date)}</span>
            <span className={styles.latestValue}>{formatCm(latest.value)}</span>
          </div>
          <LineChart labels={labels} values={values} height={height} />
          {caption && <p className={styles.caption}>{caption}</p>}
        </>
      )}
    </div>
  );
}
