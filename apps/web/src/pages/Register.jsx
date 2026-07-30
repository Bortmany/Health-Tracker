import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, ErrorText, Field, Input } from '../components/ui/index.js';
import { useRegister } from '../hooks/useAuth.js';
import { emailError } from '../lib/validation.js';
import styles from './Auth.module.css';

export default function Register() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('consumer');
  // The email message only appears once the field has been visited or the
  // form submitted — nobody wants a red box before they've typed anything.
  const [emailTouched, setEmailTouched] = useState(false);
  const register = useRegister();
  const navigate = useNavigate();

  const emailMessage = emailTouched ? emailError(email) : '';

  function handleSubmit(e) {
    e.preventDefault();
    setEmailTouched(true);
    if (emailError(email)) return;
    register.mutate(
      { displayName, email: email.trim(), password, role },
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
                placeholder="John Doe"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
                required
              />
            </Field>
            <Field label="Email" error={emailMessage || register.isError}>
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
            <Field label="Password" error={register.isError}>
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
            <p className={styles.legalNote}>
              By creating an account you agree to the <Link to="/terms">Terms</Link> and{' '}
              <Link to="/privacy">Privacy Policy</Link>.
            </p>
          </form>
          <p className={styles.switch}>
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
