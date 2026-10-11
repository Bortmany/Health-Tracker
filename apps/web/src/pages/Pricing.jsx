import { Link } from 'react-router-dom';
import ContactEmail from '../components/ContactEmail.jsx';
import { Chip } from '../components/ui/index.js';
import { useMe } from '../hooks/useAuth.js';
import { pricing as copy } from '../lib/billingCopy.js';
import styles from './Pricing.module.css';

// Public page: static wording from billingCopy.js (prices come from
// lib/pricing.js), no money calls, so it reads the same whether payments are
// switched on or not. Its buttons lead to join / browse, never to checkout.
export default function Pricing() {
  const { data: user } = useMe();
  const joinTo = user ? '/' : '/register';
  const aiTo = user ? '/account/subscription#plans' : '/register';

  return (
    <div className={styles.screen}>
      <div className={styles.shell}>
        <div className={styles.wordmark}>
          <Link to="/">Cut</Link>
        </div>

        <h1 className={styles.headline}>{copy.headline}</h1>
        <p className={styles.sub}>{copy.sub}</p>

        <div className={styles.grid}>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{copy.freeTitle}</h2>
            <p className={styles.price}>{copy.freePrice}</p>
            <p className={styles.body}>{copy.freeBody}</p>
            <Link className={styles.cta} to={joinTo}>
              Join Cut
            </Link>
          </section>

          <section className={`${styles.card} ${styles.cardAccent}`}>
            <h2 className={styles.cardTitle}>
              {copy.aiTitle} <Chip tone="accent">{copy.aiChip}</Chip>
            </h2>
            <p className={styles.price}>{copy.aiPrice}</p>
            <p className={styles.body}>{copy.aiBody}</p>
            <Link className={styles.cta} to={aiTo}>
              {copy.aiButton}
            </Link>
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{copy.coachTitle}</h2>
            <p className={styles.price}>{copy.coachPrice}</p>
            <p className={styles.body}>{copy.coachBody}</p>
            <Link className={`${styles.cta} ${styles.ctaQuiet}`} to="/coaches">
              {copy.coachButton}
            </Link>
          </section>
        </div>

        <div className={styles.explainer}>
          <div>
            <h2 className={styles.sectionTitle}>{copy.cutTitle}</h2>
            <ul className={styles.lines}>
              {copy.cutLines.map((line) => (
                <li key={line}>
                  <span className={styles.tick} aria-hidden="true">
                    ✓
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className={styles.example}>
            <div className={styles.exampleRow}>{copy.exampleStudent}</div>
            <div className={`${styles.exampleRow} ${styles.exampleKeep}`}>{copy.exampleCoach}</div>
            <div className={styles.exampleRow}>{copy.exampleCut}</div>
          </div>
        </div>

        <p className={styles.reassure}>
          {copy.reassurance} <Link to="/refunds">{copy.refundLink}</Link> ·{' '}
          <Link to="/terms">{copy.termsLink}</Link>
        </p>

        <footer className={styles.footer}>
          <div className={styles.footerLinks}>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/refunds">Refunds</Link>
          </div>
          <div>
            {copy.questions} <ContactEmail />
          </div>
        </footer>
      </div>
    </div>
  );
}
