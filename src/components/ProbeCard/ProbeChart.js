import React from 'react';
import { Line } from 'react-chartjs-2';
import 'chart.js/auto';

const ProbeChart = ({ probe, data }) => {
  const labels = data.map(item => new Date(item.timestamp).toLocaleTimeString());
  const probeData = data.map(item => item[probe.id]);

  const chartData = {
    labels,
    datasets: [
      {
        label: `${probe.name} Temperature (°F)`,
        data: probeData,
        fill: false,
        borderColor: '#3e95cd',
        tension: 0.4, // Smooth line curves
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#fff',
        },
      },
      tooltip: {
        callbacks: {
          label: (context) => `${context.dataset.label}: ${context.raw}°F`,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: '#fff' },
        grid: { color: '#444' },
      },
      y: {
        ticks: { color: '#fff' },
        grid: { color: '#444' },
      },
    },
  };

  return (
    <div style={{ width: '75%', height: '200px', marginBottom: '20px' }}>
      <h3 style={{ color: '#fff', textAlign: 'left' }}>{probe.name} Temperature Trends</h3>
      <div style={{ width: '100%', height: '100%' }}>
        <Line data={chartData} options={chartOptions} />
      </div>
    </div>
  );
};

export default ProbeChart;
