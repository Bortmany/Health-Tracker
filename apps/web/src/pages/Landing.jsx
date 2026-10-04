import { useState } from 'react';
import { Link } from 'react-router-dom';
import ProgressRing from '../components/ui/ProgressRing.jsx';
import { useSignupMode } from '../hooks/useAuth.js';
import useReveal from '../hooks/useReveal.js';
import { pricing as pricingCopy } from '../lib/billingCopy.js';
import { priceLine } from '../lib/pricing.js';
import styles from './Landing.module.css';

// Public marketing page shown at "/" to signed-out visitors (see App.jsx's
// RootRoute). Everything here is client-side only — no network calls — so
// it collects no personal data and needs no privacy-page update. The one
// server call is the public sign-up mode, so the join buttons never promise
// open sign-up while Cut is invitation-only or closed.

const HABITS = [
  { id: 'water', label: 'Water' },
  { id: 'steps', label: 'Steps' },
  { id: 'stretch', label: 'Stretch' },
  { id: 'sleep', label: 'Sleep' },
];

const FEATURES = [
  {
    title: 'Muscle heat map',
    tag: 'New',
    body: "A front-and-back body map that lights up where you've trained recently, so you can spot the muscle group you've been skipping.",
  },
  {
    title: 'Daily logs',
    body: 'Weight, sleep, steps, habits and how you felt — one place, one minute a day.',
  },
  {
    title: 'Training programs & rest timer',
    body: 'Follow a real program with a built-in timer between sets, not a blank notebook.',
  },
  {
    title: 'Charts & personal records',
    body: 'See your trend lines and every PR you have hit, tracked automatically.',
  },
  {
    title: 'Coach mode',
    body: 'Coaches can assign and edit programs directly inside a client’s account.',
  },
];

const GOALS = ['Lose fat', 'Build muscle', 'Get fitter'];
const DAYS_OPTIONS = ['2–3 days', '4–5 days', '6+ days'];
const EQUIPMENT_OPTIONS = ['Full gym', 'Home basics', 'Bodyweight only'];

// Static local logic only — a light taste of the real onboarding quiz,
// which matches against 14 seeded plans on the server.
function matchPlan(goal, days, equipment) {
  if (equipment === 'Bodyweight only') return 'Bodyweight Conditioning';
  if (goal === 'Build muscle' && days === '6+ days') return 'Upper / Lower Split — Advanced';
  if (goal === 'Build muscle') return 'Push / Pull / Legs';
  if (goal === 'Lose fat' && days === '2–3 days') return 'Full-Body Fat Loss — 3 Day';
  if (goal === 'Lose fat') return 'Full-Body Fat Loss + Conditioning';
  return 'Balanced General Fitness';
}

function PhoneDemo() {
  const [done, setDone] = useState({ water: true, steps: false, stretch: true, sleep: false });
  const [sets, setSets] = useState(0);
  const doneCount = Object.values(done).filter(Boolean).length;
  const percent = Math.round((doneCount / HABITS.length) * 100);

  function toggle(id) {
    setDone((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className={styles.phone}>
      <p className={styles.phoneHint}>Try it — tap a habit</p>
      <div className={styles.phoneScreen}>
        <div className={styles.phoneHeader}>
          <span className={styles.phoneTitle}>Today</span>
          <ProgressRing percent={percent} size={64}>
            <span className={styles.phoneRingLabel}>
              {doneCount}/{HABITS.length}
            </span>
          </ProgressRing>
        </div>
        <p className={styles.phoneCaption}>
          {doneCount} of {HABITS.length} done
        </p>
        <div className={styles.phoneHabits}>
          {HABITS.map((h) => (
            <button
              key={h.id}
              type="button"
              className={`${styles.habitChip} ${done[h.id] ? styles.habitChipDone : ''}`}
              onClick={() => toggle(h.id)}
            >
              {h.label}
            </button>
          ))}
        </div>
        <div className={styles.phoneSetRow}>
          <span className={styles.phoneSetLabel}>Bench press · set {sets + 1}</span>
          <button type="button" className={styles.phoneLogBtn} onClick={() => setSets((s) => s + 1)}>
            Log set
          </button>
        </div>
      </div>
    </div>
  );
}

function Question({ label, options, value, onChange }) {
  return (
    <div className={styles.question}>
      <p className={styles.questionLabel}>{label}</p>
      <div className={styles.chipRow}>
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`${styles.quizChip} ${value === opt ? styles.quizChipActive : ''}`}
            onClick={() => onChange(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function PlanMatch() {
  const [goal, setGoal] = useState(null);
  const [days, setDays] = useState(null);
  const [equipment, setEquipment] = useState(null);
  const result = goal && days && equipment ? matchPlan(goal, days, equipment) : null;

  return (
    <div className={styles.quiz}>
      <Question label="Goal" options={GOALS} value={goal} onChange={setGoal} />
      <Question label="Days per week" options={DAYS_OPTIONS} value={days} onChange={setDays} />
      <Question label="Equipment" options={EQUIPMENT_OPTIONS} value={equipment} onChange={setEquipment} />
      <div className={styles.quizResult}>
        {result ? (
          <>
            <p className={styles.quizResultLabel}>Your match</p>
            <p className={styles.quizResultPlan}>{result}</p>
          </>
        ) : (
          <p className={styles.quizResultHint}>Answer all three to see your plan type.</p>
        )}
      </div>
    </div>
  );
}

function Section({ className, children }) {
  const [ref, visible] = useReveal();
  return (
    <section ref={ref} className={`${styles.reveal} ${visible ? styles.visible : ''} ${className ?? ''}`}>
      {children}
    </section>
  );
}

// The join button follows the server's sign-up mode (the same check the
// Register page uses; if the check fails we fall back to the form, like
// Register does, and the server gives the real answer on submit).
function useJoinCta() {
  const signupMode = useSignupMode();
  const mode = signupMode.isError ? 'open' : signupMode.data;
  if (mode === 'closed') return { closed: true };
  if (mode === 'invite') return { label: 'Join with your invite', note: 'Cut is invitation-only right now.' };
  if (mode === 'open') return { label: 'Start free' };
  return { label: 'Join Cut' };
}

export function JoinCta({ className, showNote = false }) {
  const cta = useJoinCta();
  if (cta.closed) {
    return <p className={styles.ctaNote}>Sign-up is closed for now. Check back soon.</p>;
  }
  return (
    <>
      <Link to="/register" className={className}>
        {cta.label}
      </Link>
      {showNote && cta.note && <p className={styles.ctaNote}>{cta.note}</p>}
    </>
  );
}

export default function Landing() {
  const joinCta = useJoinCta();
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.wordmark}>Cut</span>
        <nav className={styles.headerNav}>
          <Link to="/login" className={styles.headerLink}>
            Log in
          </Link>
          {!joinCta.closed && (
            <Link to="/register" className={styles.headerCta}>
              {joinCta.label}
            </Link>
          )}
        </nav>
      </header>

      <Section className={styles.hero}>
        <div className={styles.heroCopy}>
          <h1 className={styles.heroHeadline}>Know what to train. Every day.</h1>
          <p className={styles.heroSub}>
            Cut matches you to a real workout plan, then tracks your weight, sleep, training and streaks in
            one place — so you stop guessing and start showing up.
          </p>
          <div className={styles.heroActions}>
            {!joinCta.closed && (
              <Link to="/register" className={styles.primaryCta}>
                {joinCta.label}
              </Link>
            )}
            <Link to="/login" className={styles.secondaryCta}>
              Log in
            </Link>
          </div>
          {joinCta.note && <p className={styles.ctaNote}>{joinCta.note} Ask whoever invited you for the code.</p>}
          {joinCta.closed && <p className={styles.ctaNote}>Sign-up is closed for now. Check back soon.</p>}
        </div>
        <PhoneDemo />
      </Section>

      <Section className={styles.features}>
        <h2 className={styles.sectionTitle}>Everything you need, nothing you don&apos;t</h2>
        <div className={styles.featureGrid}>
          {FEATURES.map((f) => (
            <div key={f.title} className={`${styles.featureCard} ${f.tag ? styles.featureCardNew : ''}`}>
              {f.tag && <span className={styles.featureTag}>{f.tag}</span>}
              <h3 className={styles.featureTitle}>{f.title}</h3>
              <p className={styles.featureBody}>{f.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section className={styles.planMatch}>
        <h2 className={styles.sectionTitle}>Find your plan type in 10 seconds</h2>
        <p className={styles.sectionSub}>
          The real quiz in the app matches you to one of 14 seeded plans. Try a quick version here.
        </p>
        <PlanMatch />
      </Section>

      <Section className={styles.coach}>
        <h2 className={styles.sectionTitle}>Coaching clients? Ditch the spreadsheet.</h2>
        <p className={styles.sectionSub}>
          Send an invite code, and once a client accepts you can see their summary and assign or edit
          their program directly — no separate documents to keep in sync.
        </p>
      </Section>

      <Section className={styles.pricing}>
        <h2 className={styles.sectionTitle}>Simple pricing</h2>
        <div className={styles.pricingGrid}>
          <div className={styles.priceCard}>
            <h3 className={styles.priceTitle}>Free</h3>
            <p className={styles.pricePoint}>Free, always</p>
            <p className={styles.priceBody}>
              Full tracking — logs, training, habits, streaks — plus your full 52-week workout plan,
              matched to you.
            </p>
            <JoinCta className={styles.priceCta} />
          </div>
          <div className={`${styles.priceCard} ${styles.priceCardAccent}`}>
            <h3 className={styles.priceTitle}>Premium</h3>
            <p className={styles.pricePoint}>AI plan that adjusts weekly</p>
            <p className={styles.priceBody}>
              Everything in Free, plus a plan that re-adjusts every week from your workouts, weigh-ins
              and recovery. {priceLine()}.
            </p>
            <JoinCta className={styles.priceCta} />
          </div>
        </div>
        <p className={styles.sectionSub}>
          <Link to="/pricing">{pricingCopy.fullPricingLink}</Link>
        </p>
      </Section>

      <Section className={styles.finalCta}>
        <h2 className={styles.finalCtaHeadline}>Stop guessing what to do at the gym.</h2>
        <JoinCta className={styles.primaryCta} showNote />
      </Section>

      <footer className={styles.footer}>
        <span>&copy; {new Date().getFullYear()} Cut</span>
        <div className={styles.footerLinks}>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/pricing">{pricingCopy.footerPricing}</Link>
        </div>
      </footer>
    </div>
  );
}
