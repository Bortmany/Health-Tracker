import { Link } from 'react-router-dom';
import styles from './Legal.module.css';

// Public page — no login needed. Everything stated here is matched to what
// the app actually stores (see docs/schema.sql); update this page whenever
// the data the app collects changes.
export default function Privacy() {
  return (
    <div className={styles.screen}>
      <div className={styles.shell}>
        <h1 className={styles.wordmark}>
          <Link to="/">Cut</Link>
        </h1>
        <h2 className={styles.title}>Privacy Policy</h2>
        <p className={styles.updated}>Last updated: 18 July 2026</p>

        <div className={styles.reviewNotice}>
          This policy is a plain-language template prepared for Cut and has not
          yet been reviewed by a lawyer. The owner of Cut should have it
          professionally reviewed before relying on it.
        </div>

        <div className={styles.body}>
          <h2>What Cut is</h2>
          <p>
            Cut is a fat-loss and training tracker. Because it tracks your body
            and your health, most of what you put into it is sensitive health
            information. This page explains, in plain words, what is collected,
            why, who can see it, and the controls you have.
          </p>

          <h2>What we collect</h2>
          <ul>
            <li>
              <strong>Account details:</strong> your email address, display
              name, and password. The password is stored scrambled (hashed) —
              nobody, including us, can read it.
            </li>
            <li>
              <strong>Goals and profile:</strong> start weight, target weight,
              target date, height, age, step goal, sleep goal, and your
              training-quiz answers (experience level, training goal, equipment,
              training days per week).
            </li>
            <li>
              <strong>Daily health logs:</strong> weight, waist, sleep, heart
              rate variability, recovery, strain, steps, calories, and any notes
              you write.
            </li>
            <li>
              <strong>Habits and activities:</strong> the habits you track and
              whether you ticked them each day, plus activities and how long
              they took.
            </li>
            <li>
              <strong>Injuries:</strong> injuries you record and your daily
              pain, swelling, and can-I-train check-ins for them.
            </li>
            <li>
              <strong>Nutrition:</strong> daily calories, protein, carbs, fat,
              meals, and notes.
            </li>
            <li>
              <strong>Training:</strong> workout programs, logged sessions,
              exercises, sets (weight, reps, effort), and personal records.
            </li>
            <li>
              <strong>Plan and billing status:</strong> whether your account is
              free or Premium. If paid upgrades are switched on and you upgrade,
              our payment provider Stripe gives us a customer reference — your
              card details go to Stripe directly and never touch our servers.
            </li>
            <li>
              <strong>Device health data:</strong> only if you later connect a
              Cut phone app to Apple Health or Health Connect, it can send
              weight, steps, calories, and sleep readings. Device data only
              fills in blanks — it never overwrites something you typed.
            </li>
          </ul>
          <p>
            We do not collect your location, contacts, or photos, and there are
            no advertising or analytics trackers in the app.
          </p>

          <h2>Why we collect it</h2>
          <p>
            One reason only: to run the features you use — your charts, streaks,
            plan recommendations, and (if you connect one) your coach's view.
            Your data is never sold and never used for advertising.
          </p>

          <h2>Coaches and your data</h2>
          <p>
            Nobody sees your data unless you connect a coach, and connecting is
            always your action: a coach gives you an invite code, and entering
            it in the app is your consent. A connected coach can see your name,
            email, last 30 days of weigh-ins, recent training sessions
            (including any notes you write on those sessions), and
            your programs — and can create and edit programs in your account.
            A coach does not see your nutrition, habits, or injuries.
            You can disconnect your coach at any time from the More page, which
            immediately ends their access.
          </p>

          <h2>Cookies</h2>
          <p>
            Cut uses exactly one cookie: a login session cookie so you stay
            signed in. There are no advertising or tracking cookies.
          </p>

          <h2>Where your data lives, and who helps us run Cut</h2>
          <ul>
            <li>
              <strong>Hosting:</strong> the app and its database run on
              Railway, a cloud hosting provider.
            </li>
            <li>
              <strong>Payments:</strong> Stripe, only if you buy a Premium
              upgrade.
            </li>
            <li>
              <strong>Fonts:</strong> the app's fonts load from Google Fonts,
              which means your browser requests font files from Google.
            </li>
            <li>
              <strong>Error tracking:</strong> if switched on, technical error
              reports (with secrets removed) go to Sentry so problems can be
              fixed.
            </li>
          </ul>

          <h2>Your rights: download and delete</h2>
          <p>
            From the More page you can, at any time and without asking anyone:
          </p>
          <ul>
            <li>
              <strong>Download my data</strong> — get a single file containing
              everything you have ever logged.
            </li>
            <li>
              <strong>Delete my account</strong> — permanently erase your
              account and every log, program, and record in it. This is
              immediate and cannot be undone. If you are a coach, your clients
              keep their own data and any programs you wrote for them.
            </li>
          </ul>

          <h2>How long we keep data</h2>
          <p>
            For as long as your account exists. Delete your account and it is
            gone.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about your data: [owner — add your contact email here
            before launch].
          </p>

          <h2>Changes to this policy</h2>
          <p>
            If this policy changes in a way that matters, the date at the top
            changes and significant changes will be flagged in the app.
          </p>
        </div>

        <p className={styles.footerLinks}>
          <Link to="/terms">Terms of Use</Link> · <Link to="/login">Back to Cut</Link>
        </p>
      </div>
    </div>
  );
}
