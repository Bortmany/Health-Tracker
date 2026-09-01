import { Link } from 'react-router-dom';
import styles from './Legal.module.css';

// Public page — no login needed. Paddle (who sells Premium as the merchant of
// record) only approves a seller account once a refund and cancellation policy
// is published on the live site, and this page is what that requirement points
// at. Kept factually matched to what Cut actually does: a free tier that never
// expires and needs no card, a monthly Premium subscription, cancel any time,
// access runs to the end of the paid period.
export default function Refunds() {
  return (
    <div className={styles.screen}>
      <div className={styles.shell}>
        <h1 className={styles.wordmark}>
          <Link to="/">Cut</Link>
        </h1>
        <h2 className={styles.title}>Refund &amp; Cancellation Policy</h2>
        <p className={styles.updated}>Last updated: 1 September 2026</p>

        <div className={styles.reviewNotice}>
          This policy is a plain-language template prepared for Cut and has not
          yet been reviewed by a lawyer. The owner of Cut should have it
          professionally reviewed before relying on it.
        </div>

        <div className={styles.body}>
          <h2>Try before you pay</h2>
          <p>
            Cut has no trial to keep track of, because the free tier needs no
            card details and never expires. You can log your weight, food,
            habits and training, and follow a 4-week plan, without paying
            anything. Premium unlocks year-long plans, and you only pay once you
            have decided the app is worth it. Nothing is ever charged
            automatically to an account that hasn't chosen to upgrade.
          </p>

          <h2>Cancelling</h2>
          <p>
            Premium is a monthly subscription and you can cancel at any time.
            There is no cancellation fee and no notice period.
          </p>
          <p>
            When you cancel, you keep Premium until the end of the period you
            have already paid for. After that the account goes back to the free
            tier. Your logs, plans and history stay exactly where they are —
            cancelling never deletes your data. (Deleting your account, from the
            More page, does — permanently and immediately.)
          </p>

          <h2>Refunds</h2>
          <p>
            If something has gone wrong, ask. We would rather fix it or refund
            it than keep money from somebody who is unhappy.
          </p>
          <ul>
            <li>
              <strong>Within 14 days of a payment</strong> — if you have barely
              used Premium in that time, tell us and we will refund it in full,
              no explanation needed.
            </li>
            <li>
              <strong>Charged by mistake</strong> — for example a renewal you
              meant to cancel, or a duplicate charge — we refund it in full,
              whenever you spot it.
            </li>
            <li>
              <strong>The service was broken</strong> — if Cut was unavailable
              or unusable for a meaningful part of a period you paid for, we
              refund that period in full or in part, whichever fairly matches
              what you lost.
            </li>
          </ul>
          <p>
            Outside those cases, payments for a period you have already used are
            generally not refunded, because you can cancel before the next one
            starts. Nothing here takes away rights the law gives you where you
            live, including any statutory cooling-off or cancellation rights.
          </p>

          <h2>How to ask for one</h2>
          <p>
            Email us from the address on your account, saying which payment you
            mean: [owner — add your contact email here before launch]. We aim to
            answer within a few working days. Approved refunds go back to the
            card or account you paid with, and usually arrive within 5–10
            working days depending on your bank.
          </p>
          <p>
            Payments for Cut are handled by Paddle, who act as the reseller and
            merchant of record — so it is Paddle, not Cut, that appears on your
            card or bank statement. You can also raise a billing question with
            them directly, and they will pass genuine refund decisions on to us.
          </p>

          <h2>Chargebacks</h2>
          <p>
            Please talk to us before asking your bank to reverse a charge — a
            chargeback costs us a fee and takes weeks, where a direct refund
            usually takes days. Accounts with an unresolved chargeback may be
            suspended until it is settled.
          </p>

          <h2>Changes</h2>
          <p>
            This policy may be updated as the app changes; the date at the top
            changes when it does. The version in force when you paid is the one
            that applies to that payment.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about billing, cancelling, or a refund: [owner — add your
            contact email here before launch].
          </p>
        </div>

        <p className={styles.footerLinks}>
          <Link to="/terms">Terms of Use</Link> ·{' '}
          <Link to="/privacy">Privacy Policy</Link> ·{' '}
          <Link to="/login">Back to Cut</Link>
        </p>
      </div>
    </div>
  );
}
