import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { syncHealthData } from '../native/healthSync.js';
import BottomNav from './BottomNav.jsx';
import styles from './AppLayout.module.css';

export default function AppLayout() {
  // Inside the iOS app this pulls Apple Health data once a day;
  // on the website it does nothing.
  useEffect(() => {
    syncHealthData();
  }, []);

  return (
    <div className={styles.layout}>
      <Outlet />
      <BottomNav />
    </div>
  );
}
