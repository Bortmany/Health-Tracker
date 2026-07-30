import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, ErrorText, Field, Input } from '../components/ui/index.js';
import { useLogin } from '../hooks/useAuth.js';
import { emailError } from '../lib/validation.js';
import styles from './Auth.module.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // The email message only appears once the field has been visited or the
  // form submitted — nobody wants a red box before they've typed anything.
  const [emailTouched, setEmailTouched] = useState(false);
  const login = useLogin();
  const navigate = useNavigate();

  const emailMessage = emailTouched ? emailError(email) : '';

  function handleSubmit(e) {
    e.preventDefault();
    setEmailTouched(true);
    if (emailError(email)) return;
    login.mutate({ email: email.trim(), password }, { onSuccess: () => navigate('/') });
  }

  return (
    <div className={styles.screen}>
      <div className={styles.shell}>
        <Card className={styles.card}>
          <h1 className={styles.wordmark}>Cut</h1>
          <p className={styles.subtitle}>Log in to your tracker</p>
          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <Field label="Email" error={emailMessage || login.isError}>
              <Input
                id="email"
                type="email"
                placeholder="JohnDoe@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setEmailTouched(true)}
                autoComplete="email"
                aria-invalid={emailMessage ? 'true' : undefined}
                required
              />
            </Field>
            <Field label="Password" error={login.isError}>
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
