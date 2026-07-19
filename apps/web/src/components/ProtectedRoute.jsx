import { Navigate, Outlet } from 'react-router-dom';
import { Skeleton } from './ui/index.js';
import { useMe } from '../hooks/useAuth.js';

export default function ProtectedRoute() {
  const { data: user, isLoading } = useMe();

  if (isLoading) {
    return (
      <div style={{ padding: '1.5rem' }}>
        <Skeleton height={24} width="40%" style={{ marginBottom: 12 }} />
        <Skeleton height={120} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
