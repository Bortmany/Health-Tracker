import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  Card,
  Checkbox,
  ChipToggle,
  ErrorText,
  Field,
  Input,
  Screen,
  Skeleton,
  TextArea,
  Toast,
  useToast,
} from '../components/ui/index.js';
import { useCoachProfile, useUpdateCoachProfile } from '../hooks/useCoachProfile.js';
import { SPECIALTIES } from '../lib/specialties.js';
import styles from './CoachProfileEditor.module.css';

const HEADLINE_MAX = 80;
const BIO_MAX = 1000;
const INCOMPLETE_MESSAGE =
  'Add a headline, a bio of at least 80 characters, and at least one specialty before making your profile public.';

function buildForm(profile) {
  return {
    headline: profile?.headline ?? '',
    bio: profile?.bio ?? '',
    specialties: profile?.specialties ?? [],
    acceptingClients: profile?.acceptingClients ?? true,
    isPublic: profile?.isPublic ?? false,
  };
}

// Selects the text inside an element — the fallback when the clipboard API
// isn't available (older browsers, non-secure origins), so the coach can
// still copy it by hand.
function selectText(el) {
  if (!el) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function ProfileForm({ profile, onSaved }) {
  const update = useUpdateCoachProfile();
  const [form, setForm] = useState(buildForm(profile));

  // Server-loaded values win over a stale draft when the profile refreshes
  // (e.g. after a save), same as the Goals form on More.
  useEffect(() => {
    setForm(buildForm(profile));
  }, [profile]);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleSpecialty(code) {
    setForm((f) => ({
      ...f,
      specialties: f.specialties.includes(code)
        ? f.specialties.filter((c) => c !== code)
        : [...f.specialties, code],
    }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    update.mutate(
      {
        headline: form.headline.trim(),
        bio: form.bio.trim(),
        specialties: form.specialties,
        acceptingClients: form.acceptingClients,
        isPublic: form.isPublic,
      },
      { onSuccess: () => onSaved() }
    );
  }

  const incomplete = update.isError && update.error?.code === 'PROFILE_INCOMPLETE';
  const otherError = update.isError && !incomplete;
  const years = profile.yearsCoaching;

  return (
    <Card>
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <div className={styles.readOnly}>
          <div className={styles.mutedLine}>Credentials: {profile.credentials || '—'}</div>
          <div className={styles.mutedLine}>
            {years == null ? '—' : `${years} year${years === 1 ? '' : 's'} coaching`}
          </div>
          <div className={styles.faintNote}>From your application — contact us to change.</div>
        </div>

        <Field label="Headline">
          <Input
            type="text"
            placeholder="Fat-loss coach, 6 years"
            maxLength={HEADLINE_MAX}
            value={form.headline}
            onChange={(e) => set('headline', e.target.value.slice(0, HEADLINE_MAX))}
          />
        </Field>

        <Field label="Bio">
          <TextArea
            rows={6}
            maxLength={BIO_MAX}
            placeholder="Tell potential clients about your approach, experience, and what it's like to train with you."
            value={form.bio}
            onChange={(e) => set('bio', e.target.value.slice(0, BIO_MAX))}
          />
          <div className={form.bio.length > BIO_MAX ? styles.counterOver : styles.counter} aria-live="polite">
            {form.bio.length}/{BIO_MAX}
          </div>
        </Field>

        <div className={styles.field}>
          <span className={styles.label}>Specialties</span>
          <div className={styles.chipRow}>
            {SPECIALTIES.map((s) => (
              <ChipToggle
                key={s.code}
                selected={form.specialties.includes(s.code)}
                onToggle={() => toggleSpecialty(s.code)}
              >
                {s.label}
              </ChipToggle>
            ))}
          </div>
          <div className={styles.hint}>Pick at least one to go public.</div>
        </div>

        <Checkbox checked={form.acceptingClients} onChange={(e) => set('acceptingClients', e.target.checked)}>
          Accepting new clients
        </Checkbox>

        <div>
          <Checkbox checked={form.isPublic} onChange={(e) => set('isPublic', e.target.checked)}>
            Show my profile in the public directory
          </Checkbox>
          <div className={styles.hint}>
            Visible to anyone browsing the coach directory once you have a headline, a bio of at least 80
            characters, and at least one specialty.
          </div>
          {incomplete && <ErrorText>{INCOMPLETE_MESSAGE}</ErrorText>}
        </div>

        <div className={styles.submitRow}>
          <Button type="submit" block disabled={update.isPending}>
            {update.isPending ? 'Saving...' : 'Save changes'}
          </Button>
          {otherError && <ErrorText>Something went wrong — please try again.</ErrorText>}
        </div>
      </form>
    </Card>
  );
}

function ShareCard({ profile, onCopied }) {
  const [copied, setCopied] = useState(false);
  const linkRef = useRef(null);
  const copiedTimerRef = useRef(null);
  useEffect(() => () => window.clearTimeout(copiedTimerRef.current), []);

  const link =
    profile.referralLink || `${window.location.origin}/coach/${profile.slug}?ref=${profile.referralCode}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // No clipboard access — leave the link selected so it can be copied by hand.
      selectText(linkRef.current);
      return;
    }
    window.clearTimeout(copiedTimerRef.current);
    setCopied(true);
    copiedTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
    onCopied();
  }

  return (
    <Card title="Share your profile">
      <div className={styles.linkBox}>
        <span className={styles.linkText} ref={linkRef}>
          {link}
        </span>
        <Button variant="secondary" size="sm" onClick={copyLink}>
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>
      {profile.isPublic ? (
        <a className={styles.previewLink} href={`/coach/${profile.slug}`} target="_blank" rel="noopener noreferrer">
          Preview public page
        </a>
      ) : (
        <div>
          <span className={styles.previewDisabled} aria-disabled="true">
            Preview public page
          </span>
          <div className={styles.hint}>Publish your profile to preview how it looks.</div>
        </div>
      )}
    </Card>
  );
}

export default function CoachProfileEditor() {
  const { data: profile, isLoading, isError, refetch, isFetching } = useCoachProfile();
  const toast = useToast();

  let content;
  if (isLoading) {
    content = <Skeleton height={300} />;
  } else if (isError || !profile) {
    content = (
      <Card>
        <ErrorText>Couldn&apos;t load your profile — please try again.</ErrorText>
        <Button variant="secondary" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Retrying...' : 'Retry'}
        </Button>
      </Card>
    );
  } else {
    content = (
      <div className={styles.stack}>
        <ProfileForm profile={profile} onSaved={() => toast.show('Saved')} />
        <ShareCard profile={profile} onCopied={() => toast.show('Link copied')} />
      </div>
    );
  }

  return (
    <Screen
      title="Your coach profile"
      label={
        <Link className={styles.backLink} to="/more">
          ← Back
        </Link>
      }
    >
      {content}
      <Toast message={toast.message} />
    </Screen>
  );
}
