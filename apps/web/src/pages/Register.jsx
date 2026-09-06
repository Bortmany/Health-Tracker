import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, ErrorText, Field, Input, Skeleton } from '../components/ui/index.js';
import { useRegister, useSignupMode } from '../hooks/useAuth.js';
import { emailError } from '../lib/validation.js';
import styles from './Auth.module.css';

export default function Register() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Signup invite code (only asked for when sign-up is invitation-only). Kept
  // as '' in state and sent as null when empty, like every other form field.
  const [inviteCode, setInviteCode] = useState('');
  // The email message only appears once the field has been visited or the
  // form submitted — nobody wants a red box before they've typed anything.
  const [emailTouched, setEmailTouched] = useState(false);
  const register = useRegister();
  const navigate = useNavigate();
  // "open" | "invite" | "closed". While loading we show a skeleton; if the
  // check fails we assume "open" and let the server decide on submit.
  const signupMode = useSignupMode();
  const mode = signupMode.isError ? 'open' : signupMode.data;

  const emailMessage = emailTouched ? emailError(email) : '';
  const inviteError = register.isError && register.error.code === 'INVITE_REQUIRED';

  function handleSubmit(e) {
    e.preventDefault();
    setEmailTouched(true);
    if (emailError(email)) return;
    // Everyone signs up as a regular account; coach access is granted separately.
    register.mutate(
      {
        displayName,
        email: email.trim(),
        password,
        inviteCode: inviteCode.trim() === '' ? null : inviteCode.trim(),
      },
      { onSuccess: () => navigate('/onboarding') }
    );
  }

  if (signupMode.isPending) {
    return (
      <div className={styles.screen}>
        <div className={styles.shell}>
          <Card className={styles.card}>
            <h1 className={styles.wordmark}>Cut</h1>
            <p className={styles.subtitle}>Create your account</p>
            <Skeleton height="2.75rem" count={3} />
          </Card>
        </div>
      </div>
    );
  }

  if (mode === 'closed') {
    return (
      <div className={styles.screen}>
        <div className={styles.shell}>
          <Card className={styles.card}>
            <h1 className={styles.wordmark}>Cut</h1>
            <p className={styles.subtitle}>Create your account</p>
            <p className={styles.notice}>
              Sign-up is closed for now. Check back soon.
            </p>
            <p className={styles.switch}>
              Already have an account? <Link to="/login">Log in</Link>
            </p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.shell}>
        <Card className={styles.card}>
          <h1 className={styles.wordmark}>Cut</h1>
          <p className={styles.subtitle}>Create your account</p>
          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            {mode === 'invite' && (
              <Field label="Invite code" error={inviteError ? register.error.message : false}>
                <Input
                  id="inviteCode"
                  type="text"
                  placeholder="Paste your invite code"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  aria-invalid={inviteError ? 'true' : undefined}
                  required
                />
                <p className={styles.hint}>Cut is invitation-only right now. Ask whoever invited you for the code.</p>
              </Field>
            )}
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
            <Field label="Email" error={emailMessage || (register.isError && !inviteError)}>
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
            <Field label="Password" error={register.isError && !inviteError}>
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
            {register.isError && !inviteError && <ErrorText>{register.error.message}</ErrorText>}
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
