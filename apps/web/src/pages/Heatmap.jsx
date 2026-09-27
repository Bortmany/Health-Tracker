import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BodyHeatmap from '../components/BodyHeatmap.jsx';
import { Button, Card, Chip, EmptyState, Screen, Skeleton, StatCard } from '../components/ui/index.js';
import { useMuscleHeatmap } from '../hooks/useMuscleHeatmap.js';
import { MUSCLE_LABELS } from '../lib/muscles.js';
import styles from './Heatmap.module.css';

const WINDOWS = [7, 14, 30];

const LEGEND = [
  { className: 'swatch0', label: 'Not trained' },
  { className: 'swatch1', label: 'Light' },
  { className: 'swatch2', label: 'Medium' },
  { className: 'swatch3', label: 'High' },
  { className: 'swatch4', label: 'Hot' },
];

// "2026-07-24" → "Today" / "Yesterday" / "3 days ago".
function daysAgoLabel(dateISO) {
  if (!dateISO) return null;
  const then = new Date(`${dateISO.slice(0, 10)}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((now - then) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return `${diff} days ago`;
}

// The same bucket colors the map uses, reused for the intensity meter.
function meterClass(intensity) {
  if (intensity >= 76) return styles.meterHeat4;
  if (intensity >= 51) return styles.meterHeat3;
  if (intensity >= 26) return styles.meterHeat2;
  return styles.meterHeat1;
}

export default function Heatmap() {
  const [days, setDays] = useState(7);
  const [view, setView] = useState('front');
  const [selected, setSelected] = useState(null);
  const navigate = useNavigate();

  const { data, isLoading } = useMuscleHeatmap(days);
  const muscles = data?.muscles ?? [];
  const unmatched = data?.unmatched ?? [];

  const intensities = Object.fromEntries(muscles.map((m) => [m.muscle, m.intensity]));
  const selectedMuscle = muscles.find((m) => m.muscle === selected);
  const selectedIntensity = Math.max(0, Math.min(100, Math.round(intensities[selected] ?? 0)));

  return (
    <Screen title="Muscle heat">
      <div className={styles.stack}>
        <div className={styles.controls}>
          <div className={styles.chipRow} role="group" aria-label="Time window">
            {WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                className={`${styles.chipButton} ${days === w ? styles.chipActive : ''}`.trim()}
                aria-pressed={days === w}
                onClick={() => setDays(w)}
              >
                {w} days
              </button>
            ))}
          </div>
          <div className={`${styles.chipRow} ${styles.viewToggle}`} role="group" aria-label="Body view">
            {['front', 'back'].map((v) => (
              <button
                key={v}
                type="button"
                className={`${styles.chipButton} ${view === v ? styles.chipActive : ''}`.trim()}
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {v === 'front' ? 'Front' : 'Back'}
              </button>
            ))}
          </div>
        </div>

        <Card>
          {isLoading ? (
            <Skeleton height={320} />
          ) : (
            <div className={styles.views}>
              <div className={`${styles.pane} ${view === 'front' ? styles.paneActive : ''}`.trim()}>
                <BodyHeatmap view="front" intensities={intensities} selected={selected} onSelect={setSelected} />
                <p className={styles.viewLabel}>Front</p>
              </div>
              <div className={`${styles.pane} ${view === 'back' ? styles.paneActive : ''}`.trim()}>
                <BodyHeatmap view="back" intensities={intensities} selected={selected} onSelect={setSelected} />
                <p className={styles.viewLabel}>Back</p>
              </div>
            </div>
          )}

          <div className={styles.legend}>
            {LEGEND.map((item) => (
              <span className={styles.legendItem} key={item.label}>
                <span className={`${styles.swatch} ${styles[item.className]}`} />
                {item.label}
              </span>
            ))}
          </div>
        </Card>

        {!isLoading && muscles.length === 0 && (
          <EmptyState action={<Button onClick={() => navigate('/train')}>Log a workout</Button>}>
            Log a workout and the map lights up.
          </EmptyState>
        )}

        {isLoading ? (
          <Skeleton height="4rem" />
        ) : selected ? (
          <Card>
            <div className={styles.detailHeader}>
              <h2 className={styles.muscleName}>{MUSCLE_LABELS[selected]}</h2>
              <Chip tone={selectedIntensity > 0 ? 'accent' : 'neutral'}>heat {selectedIntensity}/100</Chip>
            </div>
            <div className={styles.meterTrack}>
              {selectedIntensity > 0 && (
                <div
                  className={`${styles.meterFill} ${meterClass(selectedIntensity)}`}
                  style={{ width: `${selectedIntensity}%` }}
                />
              )}
            </div>
            {selectedMuscle ? (
              <>
                <div className={styles.statsRow}>
                  <StatCard label="Sets" value={selectedMuscle.totalSets} />
                  {selectedMuscle.totalVolume > 0 && (
                    <StatCard label="Volume" value={`${Math.round(selectedMuscle.totalVolume).toLocaleString()} kg`} />
                  )}
                  <StatCard label="Last trained" value={daysAgoLabel(selectedMuscle.lastTrained) ?? '—'} />
                </div>
                {selectedMuscle.topExercises?.length > 0 && (
                  <div className={styles.exerciseList}>
                    <p className={styles.exerciseListTitle}>Top exercises</p>
                    {selectedMuscle.topExercises.slice(0, 3).map((ex) => (
                      <div className={styles.exerciseRow} key={ex.name}>
                        <span className={styles.exerciseName}>{ex.name}</span>
                        <span className={styles.exerciseSets}>{ex.sets} sets</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className={styles.mutedLine}>Not trained in the last {days} days.</p>
            )}
          </Card>
        ) : (
          muscles.length > 0 && <p className={styles.hint}>Tap a muscle to see the details.</p>
        )}

        {!isLoading && unmatched.length > 0 && (
          <Card title="Not on the map yet">
            <p className={styles.mutedLine}>
              These logged exercises aren't in the library yet, so they don't color the map.
            </p>
            {unmatched.map((ex) => (
              <div className={styles.exerciseRow} key={ex.name}>
                <span className={styles.exerciseName}>{ex.name}</span>
                <span className={styles.exerciseSets}>
                  {ex.sets} sets · {ex.lastLogged?.slice(0, 10)}
                </span>
              </div>
            ))}
          </Card>
        )}
      </div>
    </Screen>
  );
}
