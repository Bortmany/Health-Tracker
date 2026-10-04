import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ContactEmail from '../components/ContactEmail.jsx';
import { Button, Card, ErrorText, Field, Input } from '../components/ui/index.js';
import { useResetPassword } from '../hooks/useAuth.js';
import { useBillingStatus } from '../hooks/useBilling.js';
import { auth as copy } from '../lib/billingCopy.js';
import { passwordResetError } from '../lib/billingLogic.js';
import styles from './Auth.module.css';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState(false);
  const reset = useResetPassword();
  const status = useBillingStatus();

  const problem = passwordResetError(password, again);
  const emailOff = status.data ? status.data.emailConfigured === false : false;
  const linkBad = !token || (reset.isError && reset.error?.code === 'LINK_INVALID');

  function handleSubmit(e) {
    e.preventDefault();
    setTouched(true);
    if (problem) return;
    reset.mutate({ token, password }, { onSuccess: () => setDone(true) });
  }

  let body;
  if (status.isLoading) {
    body = (
      <div className={styles.form}>
        <div className="skeleton" style={{ height: 44 }} />
        <div className="skeleton" style={{ height: 44 }} />
      </div>
    );
  } else if (emailOff) {
    body = (
      <p className={styles.notice}>
        {copy.emailOffBefore}
        <ContactEmail />
        {copy.emailOffAfter}
      </p>
    );
  } else if (done) {
    body = (
      <div className={styles.noticeStack}>
        <p className={styles.notice} role="status">
          {copy.resetDone}
        </p>
        <Link to="/login">
          <Button block>{copy.logIn}</Button>
        </Link>
      </div>
    );
  } else if (linkBad) {
    body = (
      <div className={styles.noticeStack}>
        <p className={styles.notice}>{copy.linkBad}</p>
        <Link to="/forgot-password">
          <Button block>{copy.getNewLink}</Button>
        </Link>
      </div>
    );
  } else {
    const tooShort = touched && problem === 'short' ? copy.tooShort : '';
    const mismatch = touched && problem === 'mismatch' ? copy.mismatch : '';
    const serverMessage = reset.isError ? (reset.error?.status === 429 ? copy.tooMany : copy.saveError) : '';
    body = (
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <Field label={copy.newPassword} error={tooShort}>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            aria-invalid={tooShort ? 'true' : undefined}
            required
          />
          <p className={styles.fieldHint}>{copy.newPasswordHint}</p>
        </Field>
        <Field label={copy.again} error={mismatch}>
          <Input
            id="password-again"
            type="password"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            autoComplete="new-password"
            aria-invalid={mismatch ? 'true' : undefined}
            required
          />
        </Field>
        {serverMessage && <ErrorText>{serverMessage}</ErrorText>}
        <Button type="submit" block disabled={reset.isPending}>
          {reset.isPending ? copy.savingPassword : copy.savePassword}
        </Button>
      </form>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.shell}>
        <Card className={styles.card}>
          <h1 className={styles.wordmark}>Cut</h1>
          <p className={styles.subtitle}>{copy.resetSubtitle}</p>
          {body}
          {!done && (
            <p className={styles.switch}>
              <Link to="/login">{copy.backToLogin}</Link>
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
