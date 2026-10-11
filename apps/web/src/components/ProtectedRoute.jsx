import { Navigate, Outlet } from 'react-router-dom';
import ReconnectNotice from './ReconnectNotice.jsx';
import { useMe } from '../hooks/useAuth.js';

export default function ProtectedRoute() {
  const { data: user, isLoading, isError, refetch } = useMe();

  if (isLoading) {
    return (
      <div style={{ padding: '1.5rem' }}>
        <div className="skeleton" style={{ height: 24, width: '40%', marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 120, width: '100%' }} />
      </div>
    );
  }

  // Couldn't ask (busy server / no connection): not the same as signed out.
  if (!user && isError) return <ReconnectNotice onRetry={() => refetch()} />;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
