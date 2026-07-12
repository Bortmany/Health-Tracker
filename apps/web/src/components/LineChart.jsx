import { useEffect, useRef } from 'react';
import { readToken } from '../lib/theme.js';

// The `color` prop accepts a CSS color value ('#c8f135') or a token name
// starting with '--' (e.g. '--color-chart-line-2'), which is resolved via readToken.
// Pass `rawValues` to draw a pale unsmoothed line underneath `values` — used by
// weight charts to show the noisy scale readings below the smooth trend line.
export default function LineChart({ labels, values, rawValues = null, color = '--color-chart-line', height = 160 }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  // Chart.js loads lazily, so remember the latest data to apply once it's ready.
  const dataRef = useRef({ labels, values, rawValues, color });

  function applyData(chart) {
    const { labels, values, rawValues, color } = dataRef.current;
    const lineColor = color.startsWith('--') ? readToken(color) : color;
    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.data.datasets[0].borderColor = lineColor;
    chart.data.datasets[0].backgroundColor = lineColor;
    // Dataset 0 draws on top, so the pale raw line goes in as dataset 1.
    if (rawValues) {
      const rawColor = readToken('--color-chart-raw');
      chart.data.datasets[1] = {
        data: rawValues,
        borderColor: rawColor,
        backgroundColor: rawColor,
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0,
        spanGaps: true,
      };
    } else if (chart.data.datasets.length > 1) {
      chart.data.datasets.splice(1);
    }
    chart.update();
  }

  useEffect(() => {
    let cancelled = false;

    // Chart.js is loaded on demand so it isn't part of the app's startup bundle.
    import('chart.js/auto').then(({ Chart }) => {
      if (cancelled || !canvasRef.current) return;

      const tickColor = readToken('--color-chart-tick');
      const gridColor = readToken('--color-chart-grid');
      chartRef.current = new Chart(canvasRef.current, {
        type: 'line',
        data: { labels: [], datasets: [{ data: [], pointRadius: 2, tension: 0.3, spanGaps: true }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: tickColor, maxTicksLimit: 6 }, grid: { color: gridColor } },
            y: { ticks: { color: tickColor }, grid: { color: gridColor } },
          },
        },
      });
      applyData(chartRef.current);
    });

    return () => {
      cancelled = true;
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    dataRef.current = { labels, values, rawValues, color };
    if (chartRef.current) applyData(chartRef.current);
  }, [labels, values, rawValues, color]);

  return <canvas ref={canvasRef} style={{ height, width: '100%' }} />;
}
