import { NavLink } from 'react-router-dom';
import { useMe } from '../hooks/useAuth.js';
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
  const tabs = user?.role === 'coach' ? [...TABS.slice(0, 4), COACH_TAB, TABS[4]] : TABS;
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
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
