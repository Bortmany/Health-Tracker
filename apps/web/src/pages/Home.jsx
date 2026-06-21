import { useMe, useLogout } from '../hooks/useAuth.js';

export default function Home() {
  const { data: user } = useMe();
  const logout = useLogout();

  return (
    <div style={{ padding: '1.5rem' }}>
      <h1>Welcome, {user?.displayName}</h1>
      <p style={{ color: 'var(--text-dim)' }}>{user?.email}</p>
      <button onClick={() => logout.mutate()} disabled={logout.isPending}>
        {logout.isPending ? 'Logging out...' : 'Log out'}
      </button>
    </div>
  );
}
