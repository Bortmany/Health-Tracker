import styles from './Switch.module.css';

// A labelled on/off switch (for example "Share with my coach"). The whole
// row is one 44 px tall button, so the label is part of the tap area.
// Off: a grey track; on: the accent track. Disabled while saving.
export default function Switch({ checked = false, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`${styles.switch} ${checked ? styles.on : ''}`.trim()}
      onClick={() => onChange?.(!checked)}
    >
      <span className={styles.label}>{label}</span>
      <span className={styles.track} aria-hidden="true">
        <span className={styles.knob} />
      </span>
    </button>
  );
}
