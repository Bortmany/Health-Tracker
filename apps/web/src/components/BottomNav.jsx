import { NavLink } from 'react-router-dom';
import { useMe } from '../hooks/useAuth.js';
import { useUnread } from '../hooks/useMessages.js';
import UnreadDot from './UnreadDot.jsx';
import styles from './BottomNav.module.css';

const TABS = [
  { to: '/', label: 'Today' },
  { to: '/log', label: 'Log' },
  { to: '/progress', label: 'Progress' },
  { to: '/train', label: 'Train' },
  { to: '/more', label: 'More' },
];

const COACH_TAB = { to: '/clients', label: 'Clients' };

export default function BottomNav() {
  const { data: user } = useMe();
  const isCoach = user?.role === 'coach';
  const tabs = isCoach ? [...TABS.slice(0, 4), COACH_TAB, TABS[4]] : TABS;
  // Unread messages: coaches see the dot on Clients, students on More.
  const { data: unread } = useUnread();
  const dotTab = unread ? (isCoach ? '/clients' : '/more') : null;
  return (
    <nav className={styles.nav}>
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className={({ isActive }) => `${styles.link} ${isActive ? styles.linkActive : ''}`}
        >
          <span className={styles.dot} />
          <span className={styles.label}>
            {tab.label}
            {dotTab === tab.to && <UnreadDot corner />}
          </span>
        </NavLink>
      ))}
    </nav>
  );
}
