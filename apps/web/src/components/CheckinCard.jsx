import { useNavigate } from 'react-router-dom';
import { Button, Card, Skeleton } from './ui/index.js';
import { useMyCoach } from '../hooks/useCoach.js';
import { useCurrentCheckin } from '../hooks/useCheckins.js';
import { firstName, moodLabel } from '../lib/checkin.js';
import { formatShortDay } from '../lib/localDate.js';
import styles from './CheckinCard.module.css';

// The "Weekly check-in" card on Today. Only a student with an active coach
// ever sees it; everyone else gets nothing at all (no skeleton, no gap).
export default function CheckinCard() {
  const navigate = useNavigate();
  const myCoach = useMyCoach();
  const coach = myCoach.data?.coach ?? null;
  const current = useCurrentCheckin({ enabled: Boolean(coach) });

  if (!coach) return null;

  if (current.isLoading) return <Skeleton height={96} />;

  if (current.isError) {
    return (
      <Card title="Weekly check-in">
        <p className={styles.body}>Couldn&apos;t load your check-in.</p>
        <div className={styles.action}>
          <Button variant="secondary" size="sm" onClick={() => current.refetch()}>
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  const data = current.data;
  // The server is the judge of the link: if it says there's no coach now,
  // the card goes away rather than offering a form that can't be sent.
  if (!data?.hasCoach) return null;

  const week = `Week of ${formatShortDay(data.weekStart)}`;
  const coachFirst = firstName(data.coachName ?? coach.displayName);
  const checkin = data.checkin;

  if (checkin) {
    const mood = moodLabel(checkin.mood);
    return (
      <Card title="Weekly check-in">
        <p className={styles.body}>Sent to your coach. Nice one for showing up.</p>
        <p className={styles.meta}>
          {week}
          {mood ? ` · Mood: ${mood}` : ''} · You can change it until the end of Sunday.
        </p>
        <div className={styles.action}>
          <Button variant="ghost" size="sm" onClick={() => navigate('/checkin')}>
            Edit check-in
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Weekly check-in">
      <p className={styles.body}>Tell {coachFirst} how your week went. It takes about a minute.</p>
      <p className={styles.meta}>{week}</p>
      <div className={styles.action}>
        <Button onClick={() => navigate('/checkin')}>Start check-in</Button>
      </div>
    </Card>
  );
}
