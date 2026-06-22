import LineChart from '../components/LineChart.jsx';
import { useLogsRange } from '../hooks/useLogs.js';
import { useNutritionRange } from '../hooks/useNutrition.js';
import styles from './Progress.module.css';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function dateNDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function Progress() {
  const today = todayISO();
  const from = dateNDaysAgo(59);
  const { data: logs = [], isLoading: logsLoading } = useLogsRange({ from, to: today });
  const { data: nutritionLogs = [], isLoading: nutritionLoading } = useNutritionRange({ from, to: today });

  const weighIns = logs.filter((l) => l.weight != null);
  const calorieDays = nutritionLogs.filter((l) => l.calories != null);

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>Progress</h1>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Weight (last 60 days)</h2>
        {logsLoading ? (
          <div className="skeleton" style={{ height: 160 }} />
        ) : weighIns.length > 0 ? (
          <LineChart labels={weighIns.map((l) => l.date.slice(5, 10))} values={weighIns.map((l) => l.weight)} />
        ) : (
          <p className={styles.empty}>No weigh-ins logged yet.</p>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Calories eaten (last 60 days)</h2>
        {nutritionLoading ? (
          <div className="skeleton" style={{ height: 160 }} />
        ) : calorieDays.length > 0 ? (
          <LineChart
            labels={calorieDays.map((l) => l.date.slice(5, 10))}
            values={calorieDays.map((l) => l.calories)}
            color="#8fa926"
          />
        ) : (
          <p className={styles.empty}>No food logged yet.</p>
        )}
      </section>
    </div>
  );
}
