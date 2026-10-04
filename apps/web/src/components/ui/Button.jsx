import { ariaProps } from './ariaProps.js';
import Tooltip from './Tooltip.jsx';
import styles from './Button.module.css';

// Variants: primary (lime), secondary (raised), ghost (text only), danger (outlined red).
// `title` (shared hover hint) and any aria-* attribute are passed straight through.
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
  const aria = ariaProps(rest);
  const button = (
    <button type={type} className={classes} disabled={disabled} onClick={onClick} {...aria}>
      {children}
    </button>
  );
  // The hover hint is the shared Tooltip (hover + keyboard focus). With an
  // aria-label the button already has its name, so the bubble is decoration;
  // without one the hint EXPLAINS a visible label, so it becomes the description.
  // A disabled button gets none (it can't be hovered or focused).
  if (!title || disabled) return button;
  return (
    <Tooltip text={title} describe={!aria['aria-label']}>
      {button}
    </Tooltip>
  );
}
