import { forwardRef } from 'react';
import { Button, Card, EmptyState, ErrorText } from './ui/index.js';
import { useAiPlanHistory } from '../hooks/usePlans.js';
import { describeChange, formatHistoryDate } from '../lib/aiPlan.js';
import styles from './PlanHistory.module.css';

// "Plan history" card under an AI plan: one row per weekly adjustment,
// newest first. Collapsed by default, and nothing loads until it's opened.
const PlanHistory = forwardRef(function PlanHistory({ open, onToggle }, ref) {
  const history = useAiPlanHistory(open);

  return (
    <Card className={styles.card}>
      <div ref={ref} className={styles.anchor}>
        <button
          type="button"
          className={styles.header}
          onClick={onToggle}
          aria-expanded={open}
          aria-controls="plan-history-list"
          title="See how your plan changed each week"
        >
          <span>Plan history</span>
          <span className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`.trim()} aria-hidden="true">
            ›
          </span>
        </button>

        {open && (
          <div id="plan-history-list" className={styles.content} aria-live="polite">
            {history.isLoading ? (
              <div aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className={styles.row}>
                    <div className="skeleton" style={{ width: '30%', height: '0.9rem' }} />
                    <div className="skeleton" style={{ width: '100%', height: '0.9rem' }} />
                    <div className="skeleton" style={{ width: '80%', height: '0.9rem' }} />
                  </div>
                ))}
              </div>
            ) : history.isError ? (
              <div className={styles.errorRow}>
                <ErrorText>We couldn&apos;t load your plan history.</ErrorText>
                <Button variant="ghost" size="sm" onClick={() => history.refetch()}>
                  Try again
                </Button>
              </div>
            ) : history.data.length === 0 ? (
              <EmptyState>
                Nothing here yet — your first tune-up lands a week after your AI plan is written. Small tweaks,
                big results.
              </EmptyState>
            ) : (
              <ul className={styles.list}>
                {history.data.map((adj) => {
                  const changeLines = (Array.isArray(adj.changes) ? adj.changes : [])
                    .map(describeChange)
                    .filter(Boolean);
                  return (
                    <li key={adj.id} className={styles.row}>
                      <div className={styles.rowTop}>
                        <span className={styles.week}>Week {adj.weekNumber ?? '—'}</span>
                        <span className={styles.date}>{formatHistoryDate(adj.createdAt)}</span>
                      </div>
                      <p className={styles.summary}>{adj.summary}</p>
                      {changeLines.length > 0 && (
                        <ul className={styles.changes}>
                          {changeLines.map((line, i) => (
                            <li key={i}>{line}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </Card>
  );
});

export default PlanHistory;
