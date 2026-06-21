import { NavLink } from 'react-router-dom';
import styles from './BottomNav.module.css';

const TABS = [
  { to: '/', label: 'Home' },
  { to: '/log', label: 'Log' },
  { to: '/progress', label: 'Progress' },
  { to: '/train', label: 'Train' },
  { to: '/more', label: 'More' },
];

export default function BottomNav() {
  return (
    <nav className={styles.nav}>
      {TABS.map((tab) => (
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
