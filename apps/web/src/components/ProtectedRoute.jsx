import { Navigate, Outlet } from 'react-router-dom';
import { useMe } from '../hooks/useAuth.js';

export default function ProtectedRoute() {
  const { data: user, isLoading } = useMe();

  if (isLoading) {
    return (
      <div style={{ padding: '1.5rem' }}>
        <div className="skeleton" style={{ height: 24, width: '40%', marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 120, width: '100%' }} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
