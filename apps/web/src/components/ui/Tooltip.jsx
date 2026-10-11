import { Children, cloneElement, isValidElement, useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { placeTooltip, TOOLTIP_MAX_WIDTH } from './tooltipPlacement.js';
import styles from './Tooltip.module.css';

// The one shared hover hint. Wrap a single control:
//   <Tooltip text="Close photo"><button aria-label="Close photo">...</button></Tooltip>
//
// - Shows on mouse hover AND keyboard focus; Escape closes it.
// - It adds no wrapper element, so it never changes the layout of the control.
// - The bubble never takes a tap (pointer-events: none) and never gates
//   anything: phones have no hover, so the control must make sense without it.
// - Icon-only controls carry their own aria-label, so the bubble is
//   aria-hidden (no double reading). For a control with a visible text label
//   that the hint merely EXPLAINS, pass `describe` and the bubble becomes its
//   accessible description instead.
export default function Tooltip({ text, describe = false, children }) {
  const id = useId();
  const [spot, setSpot] = useState(null);
  const child = Children.only(children);

  useEffect(() => {
    if (!spot) return undefined;
    // A scroll or resize would leave the bubble floating in the wrong place.
    const close = () => setSpot(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [spot]);

  if (!text || !isValidElement(child)) return child;

  const show = (e) => {
    setSpot(placeTooltip(e.currentTarget.getBoundingClientRect(), window.innerWidth));
  };
  const hide = () => setSpot(null);
  const chain = (name, fn) => (e) => {
    child.props[name]?.(e);
    fn(e);
  };

  const trigger = cloneElement(child, {
    onMouseEnter: chain('onMouseEnter', show),
    onMouseLeave: chain('onMouseLeave', hide),
    onFocus: chain('onFocus', show),
    onBlur: chain('onBlur', hide),
    onKeyDown: chain('onKeyDown', (e) => {
      if (e.key === 'Escape') hide();
    }),
    ...(describe ? { 'aria-describedby': id } : {}),
  });

  return (
    <>
      {trigger}
      {spot &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            aria-hidden={describe ? undefined : 'true'}
            className={`${styles.bubble} ${spot.above ? styles.above : styles.below}`}
            style={{ left: spot.x, top: spot.y, maxWidth: TOOLTIP_MAX_WIDTH }}
          >
            {text}
          </span>,
          document.body
        )}
    </>
  );
}
