import { Chart } from 'chart.js/auto';
import { useEffect, useRef } from 'react';

export default function LineChart({ labels, values, color = '#c8f135', height = 160 }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;

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

    return () => chartRef.current?.destroy();
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.data.datasets[0].borderColor = color;
    chart.data.datasets[0].backgroundColor = color;
    chart.update();
  }, [labels, values, color]);

  return <canvas ref={canvasRef} style={{ height, width: '100%' }} />;
}
