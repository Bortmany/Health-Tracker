import styles from './Checkbox.module.css';

// A native checkbox with its label text beside it. The whole label is the
// tap target, and every native prop (checked, onChange, disabled, …) is
// forwarded to the box itself.
export default function Checkbox({ children, ...props }) {
  return (
    <label className={styles.wrap}>
      <input type="checkbox" className={styles.box} {...props} />
      <span className={styles.text}>{children}</span>
    </label>
  );
}
