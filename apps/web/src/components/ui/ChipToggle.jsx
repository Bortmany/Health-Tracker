import chipStyles from './Chip.module.css';
import styles from './ChipToggle.module.css';

// A Chip you can tap. Looks exactly like Chip's neutral tone when off and its
// accent tone when on; it's a real button so keyboard focus, hover and the
// pressed dip all come for free. Use it for pick-many (specialty picker) or
// pick-one (directory filter) — the parent decides what `onToggle` does.
export default function ChipToggle({ selected = false, onToggle, disabled = false, children }) {
  return (
    <button
      type="button"
      className={`${chipStyles.chip} ${selected ? chipStyles.accent : ''} ${styles.toggle}`.trim()}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onToggle}
    >
      {children}
    </button>
  );
}
