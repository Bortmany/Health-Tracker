// Thin wrapper over the global .skeleton class (defined in index.css).
// count > 1 renders that many stacked bars with a --space-3 gap.
export default function Skeleton({ width = '100%', height = '1rem', count = 1, style }) {
  const bars = Array.from({ length: count }, (_, i) => (
    <div key={i} className="skeleton" style={{ width, height, ...style }} />
  ));
  if (count === 1) return bars[0];
  return <div style={{ display: 'grid', gap: 'var(--space-3)' }}>{bars}</div>;
}
