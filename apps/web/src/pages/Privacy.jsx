import { Link } from 'react-router-dom';
import ContactEmail from '../components/ContactEmail.jsx';
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
        <p className={styles.updated}>Last updated: 30 September 2026</p>

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
              rate variability, recovery, strain, steps, calories burned, and any notes
              you write.
            </li>
            <li>
              <strong>Body measurements:</strong> chest, arms, hips, thighs
              and neck, if you choose to log them.
            </li>
            <li>
              <strong>Progress photos:</strong> photos you choose to upload,
              with the date and an optional note. See "Progress photos" below.
            </li>
            <li>
              <strong>Check-ins and messages:</strong> weekly check-ins you send
              your coach (mood, answers and a note) and messages between you and
              your connected coach.
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
              <strong>Training:</strong> workout programs, logged sessions,
              exercises, sets (weight, reps, effort), and personal records.
            </li>
            <li>
              <strong>AI plan history (paid members only):</strong> if you are
              on the AI plan, we store a history of the weekly changes made to
              your plan — the week number, a short summary, the exercises that
              were added, removed or changed, and the date.
            </li>
            <li>
              <strong>Plan and billing status:</strong> whether your account is
              free or Premium. If paid upgrades are switched on and you pay,
              our payment processor Whop gives us a customer reference — your
              card details go to Whop directly and never touch our servers.
            </li>
            <li>
              <strong>Money ledger and payout records:</strong> each payment,
              refund and payout is recorded against the named coach and the
              named student it belongs to (amounts, Cut's commission, dates).
              For coaches we also keep their Whop account reference and whether
              their identity check has passed. A coach sees only their own
              earnings; a student never sees a coach's money records.
            </li>
            <li>
              <strong>Password-reset emails:</strong> if you ask to reset your
              password, we email your address a one-time link that expires in
              an hour. We store only a scrambled (hashed) copy of the link's
              token, never the token itself.
            </li>
            <li>
              <strong>Device health data:</strong> only if you later connect a
              Cut phone app to Apple Health or Health Connect, it can send
              weight, steps, calories burned, and sleep readings. Device data only
              fills in blanks — it never overwrites something you typed.
            </li>
          </ul>
          <p>
            We do not collect your location or contacts. The only photos we
            hold are progress photos you upload yourself. There are no
            advertising or analytics trackers in the app.
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
            always your action. A coach only sees your data after you connect
            with them, and you can do that in one of four ways: by entering
            their invite code, by sending them a request from the coach
            directory (they must accept), by accepting an invite a coach sent
            you inside the app, or by signing up through a coach's referral
            link (which creates a request that coach must accept). We keep a
            note of which coach's link you signed up through, and a record of
            coaching connections that ended or were declined, so the history
            stays honest; you can end a coaching connection at any time from
            the More page. A connected coach can see your name,
            email, last 30 days of weigh-ins, recent training sessions
            (including any notes you write on those sessions), and
            your programs — and can create and edit programs in your account.
            For the current week, a connected coach also sees your average
            sleep and steps, how many sessions you logged, the day you last
            logged, and how many habit ticks you made (a count only — not
            which habits they are).
            If you send a weekly check-in, only your connected coach sees it:
            your mood (1 to 5), your answers to their questions and your note.
            You can change it until the end of that Sunday. Your check-ins
            stay in your account, and a coach can no longer see them once the
            coaching connection ends.
            If you message your coach in Cut, only you and your coach can read
            those messages. We also note when a message has been read, so the
            sender can see it was seen. Once the coaching connection ends, the
            messages stop being visible to both of you. Your messages are
            deleted when you delete your account, and they are included in your
            data export.
            A connected coach also sees your body measurements (chest, arms,
            hips, thighs and neck, alongside your weight and waist) with no
            extra switch, and stops seeing them the moment the connection ends.
            A coach does not see your habit names or your injuries.
            A coach can also keep private notes about you inside Cut — their
            own reminders about your training — which you never see. Those
            notes stop being readable by anyone, including that coach, the
            moment the coaching connection ends.
            You can disconnect your coach at any time from the More page, which
            immediately ends their access.
          </p>
          <p>
            If you apply to become a coach, we also store what you tell us in
            the application — the name you want clients to see, your
            credentials and experience, how you train people, and any link you
            give us. The app owner reads these to decide on your application,
            and they stay on file with the decision. Withdrawing a pending
            application deletes it.
          </p>
          <p>
            <strong>Public coach profiles:</strong> if you're a coach, you
            control whether your profile is visible in Cut's public coach
            directory — it's off by default. If you switch it on, your name,
            headline, bio, specialties, credentials, years coaching, and any
            link you added become visible to anyone on the internet, without
            needing a Cut account. Your email address is never shown. You can
            switch your profile back to private at any time from your coach
            profile page.
          </p>

          <h2>Progress photos</h2>
          <p>
            Photos are private by default. Only you can see a photo until you
            switch on "Share with my coach" for that one photo. A connected
            coach then sees only the photos you have shared, and only while you
            are connected. Turning sharing off, or ending the coaching
            connection, hides them from your coach at once. Deleting a photo
            removes the file for good.
          </p>
          <p>
            Photo files are kept in private storage (a private bucket), never
            at a public address, and are only handed to you or, if shared, to
            your connected coach. We strip location data from the file when you
            upload it. Your photos are deleted with your account. Your data
            export lists your photos (the date and whether each is shared) but
            not the image files themselves. To get copies of the files, email
            us at the address under Contact below. If photo storage has not been switched on yet,
            photos can't be added.
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
              <strong>Payments and payouts:</strong> Whop, only if you buy a
              Premium upgrade or paid coaching, or if you are a coach who is
              paid through Cut.
            </li>
            <li>
              <strong>Email:</strong> Resend sends our password-reset emails
              and sees your email address when it does.
            </li>
            <li>
              <strong>AI plan (paid members only):</strong> to write your AI
              plan and adjust it each week, we send Anthropic (the company
              that makes the Claude AI) your training-quiz answers, your
              workout logs, your weigh-ins, and your recovery entries (sleep,
              steps and injuries). Nothing is sent for free members, and no
              food data is ever sent.
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
            Questions about your data: <ContactEmail />.
          </p>

          <h2>Changes to this policy</h2>
          <p>
            If this policy changes in a way that matters, the date at the top
            changes and significant changes will be flagged in the app.
          </p>
        </div>

        <p className={styles.footerLinks}>
          <Link to="/terms">Terms of Use</Link> ·{' '}
          <Link to="/refunds">Refund &amp; Cancellation Policy</Link> ·{' '}
          <Link to="/login">Back to Cut</Link>
        </p>
      </div>
    </div>
  );
}
