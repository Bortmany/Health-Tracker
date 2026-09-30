import { ariaProps } from './ariaProps.js';
import styles from './Button.module.css';

// Variants: primary (lime), secondary (raised), ghost (text only), danger (outlined red).
// `title` (hover hint) and any aria-* attribute are passed straight through.
export default function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  disabled = false,
  type = 'button',
  onClick,
  title,
  children,
  ...rest
}) {
  const classes = [
    styles.btn,
    styles[variant],
    size === 'sm' ? styles.sm : '',
    block ? styles.block : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type={type}
      className={classes}
      disabled={disabled}
      onClick={onClick}
      title={title}
      {...ariaProps(rest)}
    >
      {children}
    </button>
  );
}
