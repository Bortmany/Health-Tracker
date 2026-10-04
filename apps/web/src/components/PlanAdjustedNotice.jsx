// Patterns: WHOOP https://mobbin.com/screens/d2ed9e2b-52d2-45e0-a53b-6705c9d25f26 · GO Club https://mobbin.com/screens/681fa561-75eb-4f76-9408-baa39541aa73 · Bevel https://mobbin.com/screens/0fd25cbb-bfc8-406a-adb8-34b4a43b6379
import { useState } from 'react';
import {
  dismissNotice,
  nextAdjustmentLabel,
  noticeChangeLines,
  sessionStore,
  shouldShowNotice,
  shouldShowWaiting,
} from '../lib/aiPlan.js';
import { localToday } from '../lib/localDate.js';
import { Tooltip } from './ui/index.js';
import styles from './PlanAdjustedNotice.module.css';

// "Your plan adjusted this week" inside the plan card: a bold title, the
// summary, then up to 3 of the concrete changes. Dismissing hides it for this
// browser session only (per adjustment), so a new adjustment always shows
// again. `onSeeHistory` opens the plan history and scrolls to it.
export default function PlanAdjustedNotice({ plan, onSeeHistory }) {
  const [dismissedId, setDismissedId] = useState(null);
  const latest = plan?.latestAdjustment;

  if (!shouldShowNotice(plan, sessionStore()) || dismissedId === latest.id) return null;

  const changeLines = noticeChangeLines(latest);

  function handleDismiss() {
    dismissNotice(sessionStore(), latest.id);
    setDismissedId(latest.id);
  }

  return (
    <div className={styles.notice}>
      <div className={styles.body}>
        <p className={styles.heading}>Your plan adjusted this week</p>
        <p className={styles.summary}>{latest.summary}</p>
        {changeLines.length > 0 && (
          <ul className={styles.changes}>
            {changeLines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
        <button type="button" className={styles.link} onClick={onSeeHistory}>
          See plan history
        </button>
      </div>
      <Tooltip text="Dismiss this notice">
        <button
          type="button"
          className={styles.dismiss}
          onClick={handleDismiss}
          aria-label="Dismiss"
        >
          <span aria-hidden="true">×</span>
        </button>
      </Tooltip>
    </div>
  );
}

// The quiet line an AI plan shows while there's no adjustment this week:
// when the next one is due, worked out on this device's calendar.
export function PlanAdjustsOn({ plan }) {
  if (!shouldShowWaiting(plan)) return null;
  return (
    <p className={styles.waiting}>
      Based on this week&apos;s workouts, your plan adjusts on{' '}
      {nextAdjustmentLabel(plan.lastAdjustedOn, localToday())}.
    </p>
  );
}
