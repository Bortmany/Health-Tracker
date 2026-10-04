import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ContactEmail from '../components/ContactEmail.jsx';
import { Button, Card, ErrorText, Field, Input, Toast, useToast } from '../components/ui/index.js';
import { useForgotPassword } from '../hooks/useAuth.js';
import { useBillingStatus } from '../hooks/useBilling.js';
import { auth as copy } from '../lib/billingCopy.js';
import { emailError } from '../lib/validation.js';
import styles from './Auth.module.css';

// How long before "Send again" becomes tappable.
const RESEND_AFTER_MS = 30 * 1000;

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [sent, setSent] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const forgot = useForgotPassword();
  const status = useBillingStatus();
  const toast = useToast();

  // The "Send again" link only wakes up 30 seconds after a send.
  useEffect(() => {
    if (!sent) return undefined;
    setCanResend(false);
    const timer = setTimeout(() => setCanResend(true), RESEND_AFTER_MS);
    return () => clearTimeout(timer);
  }, [sent]);

  const emailMessage = touched ? emailError(email) : '';
  // If the status call itself failed we can't tell, so we still show the form
  // and let the server answer.
  const emailOff = status.data ? status.data.emailConfigured === false : false;

  function send(again) {
    forgot.mutate(email.trim(), {
      onSuccess: () => {
        setSent(true);
        if (again) toast.show(copy.sentAgainToast);
      },
    });
  }

  function handleSubmit(e) {
    e.preventDefault();
    setTouched(true);
    if (emailError(email)) return;
    send(false);
  }

  const errorText = forgot.isError ? (forgot.error?.status === 429 ? copy.tooMany : copy.network) : '';

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
  } else if (sent) {
    body = (
      <div className={styles.noticeStack}>
        <p className={styles.notice} role="status">
          {copy.sentNotice}
        </p>
        {forgot.isError && <ErrorText>{errorText}</ErrorText>}
        <Link to="/login">
          <Button variant="secondary" block>
            {copy.backToLogin}
          </Button>
        </Link>
        <Button
          variant="ghost"
          onClick={() => send(true)}
          disabled={!canResend || forgot.isPending}
        >
          {forgot.isPending ? copy.sending : copy.sendAgain}
        </Button>
      </div>
    );
  } else {
    body = (
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <Field label={copy.emailLabel} error={emailMessage}>
          <Input
            id="email"
            type="email"
            placeholder={copy.emailPlaceholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched(true)}
            autoComplete="email"
            aria-invalid={emailMessage ? 'true' : undefined}
            required
          />
        </Field>
        {forgot.isError && <ErrorText>{errorText}</ErrorText>}
        <Button type="submit" block disabled={forgot.isPending}>
          {forgot.isPending ? copy.sending : copy.sendLink}
        </Button>
      </form>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.shell}>
        <Card className={styles.card}>
          <h1 className={styles.wordmark}>Cut</h1>
          <p className={styles.subtitle}>{copy.forgotSubtitle}</p>
          {body}
          {!sent && (
            <p className={styles.switch}>
              <Link to="/login">{copy.backToLogin}</Link>
            </p>
          )}
        </Card>
      </div>
      <Toast message={toast.message} />
    </div>
  );
}
