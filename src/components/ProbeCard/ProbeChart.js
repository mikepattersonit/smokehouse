// ProbeChart.js (New File)
import React from 'react';
import { Line } from 'react-chartjs-2';
import 'chart.js/auto';

const ProbeChart = ({ probe, data }) => {
  // Extract chart data for the specific probe
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
      },
    ],
  };

  return (
    <div>
      <h3>{probe.name} Temperature Trends</h3>
      <Line data={chartData} />
    </div>
  );
};

export default ProbeChart;
