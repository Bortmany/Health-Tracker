import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav.jsx';

export default function AppLayout() {
  return (
    <div style={{ paddingBottom: '4.5rem' }}>
      <Outlet />
      <BottomNav />
    </div>
  );
}
