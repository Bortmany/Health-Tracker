import ErrorText from './ErrorText.jsx';
import styles from './Field.module.css';

// A labelled form control with an optional error state. Pass a string to
// show a red message under the control; pass `true` to just mark the box
// red (when the message already lives elsewhere on the screen).
export default function Field({ label, error, children }) {
  return (
    <div className={`${styles.field} ${error ? styles.fieldError : ''}`.trim()}>
      {label && <span className={styles.label}>{label}</span>}
      {children}
      {typeof error === 'string' && error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

// Text input styled to the design system. Forwards every native prop.
export function Input(props) {
  return <input className={styles.input} {...props} />;
}

// Select styled to match Input. Forwards every native prop.
export function Select(props) {
  return <select className={styles.input} {...props} />;
}
