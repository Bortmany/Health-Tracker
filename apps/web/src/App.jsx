import { useQuery } from '@tanstack/react-query';

function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch('/api/health');
      return res.json();
    },
  });
}

export default function App() {
  const { data, isLoading } = useHealth();

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
      <h1>Cut</h1>
      <p>API health: {isLoading ? 'checking...' : JSON.stringify(data)}</p>
    </div>
  );
}
