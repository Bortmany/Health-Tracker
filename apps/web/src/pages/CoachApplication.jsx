import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  Checkbox,
  ErrorText,
  Field,
  Input,
  Screen,
  TextArea,
} from '../components/ui/index.js';
import { useCreateApplication } from '../hooks/useCoachApplications.js';
import styles from './CoachApplication.module.css';

const APPROACH_MAX = 500;

function isWorkingLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// Returns a plain-English message per field, or nothing when the field is fine.
function validate(form) {
  const errors = {};
  if (form.displayName.trim() === '' || form.displayName.trim().length > 100) {
    errors.displayName = 'Enter the name you want clients to see';
  }
  if (form.credentials.trim() === '' || form.credentials.trim().length > 1000) {
    errors.credentials = 'Tell us about your training background.';
  }
  const years = form.yearsCoaching === '' ? NaN : Number(form.yearsCoaching);
  if (!Number.isInteger(years) || years < 0 || years > 60) {
    errors.yearsCoaching = 'Enter a number between 0 and 60.';
  }
  if (form.approach.trim() === '' || form.approach.length > APPROACH_MAX) {
    errors.approach = 'Tell us a bit about your coaching style.';
  }
  if (form.link.trim() !== '' && !isWorkingLink(form.link.trim())) {
    errors.link = "That doesn't look like a working link.";
  }
  return errors;
}

function submitErrorMessage(err) {
  if (err?.code === 'APPLICATION_PENDING') return 'You already have an application under review.';
  if (err?.code === 'REAPPLY_LIMIT') {
    return "You've already used your one reapply. Contact us if you'd like to discuss it.";
  }
  if (err?.code === 'RATE_LIMITED' || err?.status === 429) {
    return 'Too many attempts — please try again later.';
  }
  return 'Something went wrong — please try again.';
}

export default function CoachApplication() {
  const navigate = useNavigate();
  const createApplication = useCreateApplication();
  const [form, setForm] = useState({
    displayName: '',
    credentials: '',
    yearsCoaching: '',
    approach: '',
    link: '',
    agreed: false,
  });
  // A field only shows its message once you've been in it and left — the
  // submit button stays greyed until everything is right either way.
  const [touched, setTouched] = useState({});

  const errors = validate(form);
  const canSubmit = Object.keys(errors).length === 0 && form.agreed && !createApplication.isPending;

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function touch(key) {
    setTouched((t) => ({ ...t, [key]: true }));
  }

  function shownError(key) {
    return touched[key] ? errors[key] : undefined;
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) {
      setTouched({ displayName: true, credentials: true, yearsCoaching: true, approach: true, link: true });
      return;
    }
    createApplication.mutate(
      {
        displayName: form.displayName.trim(),
        credentials: form.credentials.trim(),
        yearsCoaching: Number(form.yearsCoaching),
        approach: form.approach.trim(),
        link: form.link.trim() === '' ? null : form.link.trim(),
        agreedToTerms: true,
      },
      { onSuccess: () => navigate('/coach-application/status') }
    );
  }

  const approachCount = form.approach.length;

  return (
    <Screen
      title="Become a coach"
      label={
        <Link className={styles.backLink} to="/more">
          ← Back
        </Link>
      }
    >
      <Card>
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <Field label="Name shown to clients" error={shownError('displayName')}>
            <Input
              type="text"
              placeholder="John Doe"
              maxLength={100}
              autoComplete="name"
              value={form.displayName}
              onChange={(e) => update('displayName', e.target.value)}
              onBlur={() => touch('displayName')}
            />
          </Field>

          <Field label="Credentials & certifications" error={shownError('credentials')}>
            <TextArea
              placeholder="e.g. NASM-CPT, 5 years personal training experience"
              maxLength={1000}
              rows={3}
              value={form.credentials}
              onChange={(e) => update('credentials', e.target.value)}
              onBlur={() => touch('credentials')}
            />
          </Field>

          <Field label="Years coaching" error={shownError('yearsCoaching')}>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="3"
              min={0}
              max={60}
              step={1}
              value={form.yearsCoaching}
              onChange={(e) => update('yearsCoaching', e.target.value)}
              onBlur={() => touch('yearsCoaching')}
            />
          </Field>

          <Field label="How do you train people?" error={shownError('approach')}>
            <TextArea
              placeholder="e.g. Simple strength programs with a food plan people can actually stick to"
              maxLength={APPROACH_MAX}
              rows={4}
              value={form.approach}
              onChange={(e) => update('approach', e.target.value.slice(0, APPROACH_MAX))}
              onBlur={() => touch('approach')}
            />
            <div className={approachCount > APPROACH_MAX ? styles.counterOver : styles.counter} aria-live="polite">
              {approachCount}/{APPROACH_MAX}
            </div>
          </Field>

          <Field label="Link (optional)" error={shownError('link')}>
            <Input
              type="url"
              inputMode="url"
              placeholder="https://instagram.com/yourname"
              autoComplete="url"
              value={form.link}
              onChange={(e) => update('link', e.target.value)}
              onBlur={() => touch('link')}
            />
          </Field>

          <Checkbox checked={form.agreed} onChange={(e) => update('agreed', e.target.checked)}>
            I understand I&apos;m responsible for the advice I give my clients, and Cut is not liable for it.
          </Checkbox>

          <div className={styles.submitRow}>
            <Button type="submit" block disabled={!canSubmit}>
              {createApplication.isPending ? 'Submitting...' : 'Submit application'}
            </Button>
            {createApplication.isError && <ErrorText>{submitErrorMessage(createApplication.error)}</ErrorText>}
          </div>
        </form>
      </Card>
    </Screen>
  );
}
