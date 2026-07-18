import { Link } from 'react-router-dom';
import styles from './Legal.module.css';

// Public page — no login needed.
export default function Terms() {
  return (
    <div className={styles.screen}>
      <div className={styles.shell}>
        <h1 className={styles.wordmark}>
          <Link to="/">Cut</Link>
        </h1>
        <h2 className={styles.title}>Terms of Use</h2>
        <p className={styles.updated}>Last updated: 18 July 2026</p>

        <div className={styles.reviewNotice}>
          These terms are a plain-language template prepared for Cut and have
          not yet been reviewed by a lawyer. The owner of Cut should have them
          professionally reviewed before relying on them.
        </div>

        <div className={styles.body}>
          <h2>What you're agreeing to</h2>
          <p>
            Cut is a fat-loss and training tracker for people training
            themselves and for coaches who train them. By creating an account
            you agree to these terms and to the{' '}
            <Link to="/privacy">Privacy Policy</Link>, which explains what data
            the app stores and your rights over it.
          </p>

          <h2>Not medical advice</h2>
          <p>
            Cut is a tracking and planning tool, not a doctor, dietitian, or
            physiotherapist. Workout plans, targets, and charts are general
            fitness information — they are not medical advice. Check with a
            health professional before starting a training or diet programme,
            especially if you have an injury or a medical condition, and stop
            and seek help if something hurts. You use the app's suggestions at
            your own judgement.
          </p>

          <h2>Your account</h2>
          <ul>
            <li>You need to give a real email address and keep your password to yourself.</li>
            <li>You are responsible for what happens under your login.</li>
            <li>One person per account — don't share logins.</li>
            <li>You must be old enough to agree to these terms where you live.</li>
          </ul>

          <h2>Coaches and clients</h2>
          <p>
            Connecting with a coach is always the client's choice, made by
            redeeming the coach's invite code. Coaches get the access described
            in the Privacy Policy and must use it only to coach that client.
            Either side can end the connection at any time from the app. Cut
            provides the tools; the coaching relationship, its quality, and any
            payment between coach and client are between the two of you.
          </p>

          <h2>Free and Premium</h2>
          <p>
            The free tier includes 4-week training plans; Premium unlocks
            year-long plans. When paid upgrades are switched on, payment is
            handled by Stripe and the price is shown before you pay. Premium is
            a subscription; cancelling stops future charges.
          </p>

          <h2>Fair use</h2>
          <ul>
            <li>Don't try to break into other people's accounts or data.</li>
            <li>Don't overload, copy, or resell the service.</li>
            <li>Don't use the app for anything illegal.</li>
          </ul>
          <p>Accounts that abuse the service can be suspended or closed.</p>

          <h2>Your data and leaving</h2>
          <p>
            Your logs are yours. You can download everything, and you can
            delete your account — permanently and immediately — from the More
            page at any time.
          </p>

          <h2>Honest limits</h2>
          <p>
            Cut is provided as-is. We work to keep it accurate, online, and
            backed up, but we can't promise it will never be down, lose a
            reading, or contain a mistake — so keep your own copy of anything
            critical (the download button makes that easy). To the extent the
            law allows, the service's responsibility is limited to what you
            paid for it.
          </p>

          <h2>Changes</h2>
          <p>
            If these terms change in a way that matters, the date at the top
            changes and significant changes will be flagged in the app.
            Continuing to use Cut after a change means you accept the updated
            terms.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about these terms: [owner — add your contact email here
            before launch].
          </p>
        </div>

        <p className={styles.footerLinks}>
          <Link to="/privacy">Privacy Policy</Link> · <Link to="/login">Back to Cut</Link>
        </p>
      </div>
    </div>
  );
}
