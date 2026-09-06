import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Avatar,
  Button,
  Card,
  Chip,
  ChipToggle,
  EmptyState,
  ErrorText,
  Screen,
  Skeleton,
} from '../components/ui/index.js';
import { useMe } from '../hooks/useAuth.js';
import { useCoaches } from '../hooks/useCoachDirectory.js';
import { SPECIALTIES } from '../lib/specialties.js';
import styles from './CoachDirectory.module.css';

// The one-line "who they are" under the headline: credentials, with years
// coaching in front when known. Truncated by CSS if it runs long.
function experienceLine(coach) {
  const parts = [];
  if (coach.yearsCoaching != null) {
    parts.push(`${coach.yearsCoaching} year${coach.yearsCoaching === 1 ? '' : 's'} coaching`);
  }
  if (coach.credentials) parts.push(coach.credentials);
  return parts.join(' · ');
}

function CoachRow({ coach }) {
  const experience = experienceLine(coach);
  return (
    <Link className={styles.rowLink} to={`/coach/${coach.slug}`}>
      <div className={styles.row}>
        <Avatar name={coach.displayName} />
        <div className={styles.rowInfo}>
          <div className={styles.rowName}>{coach.displayName}</div>
          {coach.headline && <div className={styles.rowHeadline}>{coach.headline}</div>}
          {experience && <div className={styles.rowExperience}>{experience}</div>}
        </div>
        {coach.acceptingClients && (
          <div className={styles.rowChip}>
            <Chip tone="accent">Accepting clients</Chip>
          </div>
        )}
      </div>
    </Link>
  );
}

export default function CoachDirectory() {
  const { data: user } = useMe();
  const [specialty, setSpecialty] = useState(null);
  const { data: coaches, isLoading, isError, refetch, isFetching } = useCoaches(specialty);

  let content;
  if (isLoading) {
    content = <Skeleton height="4.5rem" count={4} />;
  } else if (isError) {
    content = (
      <div className={styles.errorBlock}>
        <ErrorText>Couldn&apos;t load coaches — please try again.</ErrorText>
        <Button variant="secondary" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Retrying...' : 'Retry'}
        </Button>
      </div>
    );
  } else if (!coaches || coaches.length === 0) {
    content = (
      <EmptyState>
        {specialty
          ? 'No coaches for that specialty yet — try a different filter or check back soon.'
          : 'No coaches here yet — check back soon!'}
      </EmptyState>
    );
  } else {
    content = coaches.map((coach) => <CoachRow key={coach.slug} coach={coach} />);
  }

  return (
    <Screen
      title="Find a coach"
      label={
        user ? (
          <Link className={styles.headerLink} to="/more">
            ← Back
          </Link>
        ) : (
          <Link className={styles.headerLink} to="/login?next=/coaches">
            Log in
          </Link>
        )
      }
    >
      <div className={styles.filterRow} role="group" aria-label="Filter by specialty">
        <ChipToggle selected={specialty === null} onToggle={() => setSpecialty(null)}>
          All
        </ChipToggle>
        {SPECIALTIES.map((s) => (
          <ChipToggle key={s.code} selected={specialty === s.code} onToggle={() => setSpecialty(s.code)}>
            {s.label}
          </ChipToggle>
        ))}
      </div>

      <Card>{content}</Card>
    </Screen>
  );
}
