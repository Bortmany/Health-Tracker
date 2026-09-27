import { Outlet } from 'react-router-dom';
import { useMe } from '../hooks/useAuth.js';
import NotFound from '../pages/NotFound.jsx';

// Sits inside ProtectedRoute. Anyone who isn't a coach sees the ordinary
// "Page not found" screen — never a permission message — and the coach page
// (with its requests) is only mounted once the check has passed.
export default function CoachRoute() {
  const { data: user, isLoading } = useMe();

  if (isLoading) {
    return (
      <div style={{ padding: '1.5rem' }}>
        <div className="skeleton" style={{ height: 24, width: '40%', marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 120, width: '100%' }} />
      </div>
    );
  }

  if (user?.role !== 'coach') {
    return <NotFound />;
  }

  return <Outlet />;
}
