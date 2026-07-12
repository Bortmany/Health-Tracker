// Shared weight-trend helpers — the one smoothing rule every screen uses.
// Extracted from Dashboard, Progress, and Clients so the charts can never
// drift apart: a 7-entry moving average, and "holding steady" means the
// change is under 0.05 kg per week.

// Smooth trend line: each point is the average of the last up-to-7 values,
// so one noisy scale reading doesn't swing the line around.
export function smoothSeries(values) {
  return values.map((_, i) => {
    const window = values.slice(Math.max(0, i - 6), i + 1);
    const sum = window.reduce((total, v) => total + v, 0);
    return Number((sum / window.length).toFixed(2));
  });
}

// Plain-English caption comparing the smoothed start and end of the range,
// e.g. "Trending down — about 0.3 kg/week". Null when there's no trend yet.
export function trendCaption(weighIns, smoothed) {
  if (weighIns.length < 2) return null;
  const days =
    (new Date(`${weighIns[weighIns.length - 1].date.slice(0, 10)}T00:00:00`) -
      new Date(`${weighIns[0].date.slice(0, 10)}T00:00:00`)) /
    86400000;
  if (days <= 0) return null;
  const perWeek = ((smoothed[smoothed.length - 1] - smoothed[0]) / days) * 7;
  if (Math.abs(perWeek) < 0.05) return 'Holding steady';
  const direction = perWeek < 0 ? 'down' : 'up';
  return `Trending ${direction} — about ${Math.abs(perWeek).toFixed(1)} kg/week`;
}
