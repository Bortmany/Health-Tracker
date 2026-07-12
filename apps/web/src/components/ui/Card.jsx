import SectionTitle from './SectionTitle.jsx';
import styles from './Card.module.css';

// Standard surface: bordered, rounded, padded. Optional micro-label title.
export default function Card({ title, className = '', children }) {
  return (
    <section className={`${styles.card} ${className}`.trim()}>
      {title && (
        <div className={styles.title}>
          <SectionTitle>{title}</SectionTitle>
        </div>
      )}
      {children}
    </section>
  );
}
