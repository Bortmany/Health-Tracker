import styles from './ChoiceTiles.module.css';

// A pair (or more) of selectable tiles, like radio buttons made big: used to
// pick monthly or yearly. Built as a real radio group so a keyboard and a
// screen reader both work. `options` = [{ value, title, price, detail, chip }].
export default function ChoiceTiles({ legend, name, value, onChange, options }) {
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.tiles}>
        {options.map((option) => (
          <label
            key={option.value}
            className={`${styles.tile} ${value === option.value ? styles.selected : ''}`.trim()}
          >
            <input
              type="radio"
              className={styles.input}
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span className={styles.top}>
              <span className={styles.title}>{option.title}</span>
              {option.chip}
            </span>
            <span className={styles.price}>{option.price}</span>
            {option.detail && <span className={styles.detail}>{option.detail}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
