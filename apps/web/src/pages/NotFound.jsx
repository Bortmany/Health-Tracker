import { useNavigate } from 'react-router-dom';
import { Button, EmptyState, Screen } from '../components/ui/index.js';

// Catch-all for any address that doesn't exist. Also what non-admins see at
// admin addresses, so those pages never confirm they exist.
export default function NotFound() {
  const navigate = useNavigate();
  return (
    <Screen>
      <EmptyState action={<Button onClick={() => navigate('/')}>Back to home</Button>}>
        Page not found.
      </EmptyState>
    </Screen>
  );
}
