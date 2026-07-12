import styles from './ErrorText.module.css';

// Inline error message in the feedback red.
export default function ErrorText({ children }) {
  return <p className={styles.error}>{children}</p>;
}
