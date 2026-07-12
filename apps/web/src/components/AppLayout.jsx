import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav.jsx';
import styles from './AppLayout.module.css';

export default function AppLayout() {
  return (
    <div className={styles.layout}>
      <Outlet />
      <BottomNav />
    </div>
  );
}
