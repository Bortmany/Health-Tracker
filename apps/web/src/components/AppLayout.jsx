import { Outlet } from 'react-router-dom';
import { useHealthSync } from '../hooks/useHealthSync.js';
import BottomNav from './BottomNav.jsx';
import styles from './AppLayout.module.css';

export default function AppLayout() {
  // Inside the iOS app this pulls Apple Health data; on the website it does nothing.
  useHealthSync();

  return (
    <div className={styles.layout}>
      <Outlet />
      <BottomNav />
    </div>
  );
}
