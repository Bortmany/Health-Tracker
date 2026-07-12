import styles from './SectionTitle.module.css';

// The mono uppercase micro-label used above cards and sections.
export default function SectionTitle({ children }) {
  return <h2 className={styles.label}>{children}</h2>;
}
