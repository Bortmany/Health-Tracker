import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, ErrorText, Field, Input } from '../components/ui/index.js';
import { useRegister } from '../hooks/useAuth.js';
import styles from './Auth.module.css';

export default function Register() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('consumer');
  const register = useRegister();
  const navigate = useNavigate();

  function handleSubmit(e) {
    e.preventDefault();
    register.mutate(
      { displayName, email, password, role },
      { onSuccess: () => navigate(role === 'coach' ? '/clients' : '/onboarding') }
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.shell}>
        <Card className={styles.card}>
          <h1 className={styles.wordmark}>Cut</h1>
          <p className={styles.subtitle}>Create your account</p>
          <form className={styles.form} onSubmit={handleSubmit}>
            <Field label="Name">
              <Input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
                required
              />
            </Field>
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
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>
            <span className={styles.roleLabel}>I'm training</span>
            <div className={styles.roleToggle}>
              <button
                type="button"
                className={`${styles.roleOption} ${role === 'consumer' ? styles.roleOptionActive : ''}`}
                onClick={() => setRole('consumer')}
              >
                I'm training myself
              </button>
              <button
                type="button"
                className={`${styles.roleOption} ${role === 'coach' ? styles.roleOptionActive : ''}`}
                onClick={() => setRole('coach')}
              >
                I'm a coach
              </button>
            </div>
            {register.isError && <ErrorText>{register.error.message}</ErrorText>}
            <Button type="submit" block disabled={register.isPending}>
              {register.isPending ? 'Creating account...' : 'Create account'}
            </Button>
          </form>
          <p className={styles.switch}>
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
