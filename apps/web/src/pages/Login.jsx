import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, ErrorText, Field, Input } from '../components/ui/index.js';
import { useLogin } from '../hooks/useAuth.js';
import styles from './Auth.module.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();
  const navigate = useNavigate();

  function handleSubmit(e) {
    e.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => navigate('/') });
  }

  return (
    <div className={styles.screen}>
      <div className={styles.shell}>
        <Card className={styles.card}>
          <h1 className={styles.wordmark}>Cut</h1>
          <p className={styles.subtitle}>Log in to your tracker</p>
          <form className={styles.form} onSubmit={handleSubmit}>
            <Field label="Email">
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </Field>
            <Field label="Password">
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>
            {login.isError && <ErrorText>{login.error.message}</ErrorText>}
            <Button type="submit" block disabled={login.isPending}>
              {login.isPending ? 'Logging in...' : 'Log in'}
            </Button>
          </form>
          <p className={styles.switch}>
            No account? <Link to="/register">Register</Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
