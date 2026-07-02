import { useEffect, useRef } from 'react';

export default function LineChart({ labels, values, color = '#c8f135', height = 160 }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  // Chart.js loads lazily, so remember the latest data to apply once it's ready.
  const dataRef = useRef({ labels, values, color });

  function applyData(chart) {
    const { labels, values, color } = dataRef.current;
    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.data.datasets[0].borderColor = color;
    chart.data.datasets[0].backgroundColor = color;
    chart.update();
  }

  useEffect(() => {
    let cancelled = false;

    // Chart.js is loaded on demand so it isn't part of the app's startup bundle.
    import('chart.js/auto').then(({ Chart }) => {
      if (cancelled || !canvasRef.current) return;

      chartRef.current = new Chart(canvasRef.current, {
        type: 'line',
        data: { labels: [], datasets: [{ data: [], pointRadius: 2, tension: 0.3, spanGaps: true }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#9a9a9a', maxTicksLimit: 6 }, grid: { color: '#262626' } },
            y: { ticks: { color: '#9a9a9a' }, grid: { color: '#262626' } },
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
    dataRef.current = { labels, values, color };
    if (chartRef.current) applyData(chartRef.current);
  }, [labels, values, color]);

  return <canvas ref={canvasRef} style={{ height, width: '100%' }} />;
}
