import styles from './Sparkline.module.css';

// A tiny weight-trend line for list rows: one SVG polyline, no axes, no
// labels, no Chart.js. A dozen of these can sit in a list and paint instantly,
// which is why the row doesn't reuse the heavier LineChart.
// `values` are the weights oldest → newest. Fewer than 2 points draws nothing
// (the row shows "No weigh-ins yet" in its place instead).
const WIDTH = 60;
const HEIGHT = 20;
const PAD = 2; // keeps the rounded stroke from clipping at the edges

export default function Sparkline({ values }) {
  const nums = (values ?? []).map(Number).filter(Number.isFinite);
  if (nums.length < 2) return null;

  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min;
  const innerW = WIDTH - PAD * 2;
  const innerH = HEIGHT - PAD * 2;

  const points = nums
    .map((v, i) => {
      const x = PAD + (i / (nums.length - 1)) * innerW;
      // A perfectly flat series sits on the middle line instead of dividing by zero.
      const y = range === 0 ? HEIGHT / 2 : PAD + innerH - ((v - min) / range) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      className={styles.sparkline}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      aria-hidden="true"
      focusable="false"
    >
      <polyline points={points} />
    </svg>
  );
}
