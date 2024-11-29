import React from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

// Explicitly register components and scales
ChartJS.register(LineElement, CategoryScale, LinearScale, PointElement, Title, Tooltip, Legend);

const Chart = ({ data }) => {
  const chartData = {
    labels: data.map((point) => point.timestamp), // X-axis: Time
    datasets: [
      {
        label: 'Sensor Data',
        data: data.map((point) => point.value), // Y-axis: Sensor Values
        borderColor: 'rgba(75,192,192,1)',
        backgroundColor: 'rgba(75,192,192,0.2)',
        tension: 0.4,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
    },
    scales: {
      x: {
        title: { display: true, text: 'Time' },
      },
      y: {
        title: { display: true, text: 'Value' },
        beginAtZero: true,
      },
    },
  };

  return (
    <div>
      <h2>Historical Data</h2>
      <Line data={chartData} options={options} />
    </div>
  );
};

export default Chart;
