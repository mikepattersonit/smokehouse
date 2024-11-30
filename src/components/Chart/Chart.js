import React, { useState } from 'react';
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
  // Extract sensor IDs dynamically from data
  const sensorKeys = Object.keys(data[0] || {}).filter(
    (key) => key !== 'timestamp' && key !== 'session_id'
  );

  const [selectedSensors, setSelectedSensors] = useState(sensorKeys);

  const chartData = {
    labels: data.map((point) => new Date(point.timestamp).toLocaleString()), // X-axis: Time (formatted)
    datasets: selectedSensors.map((sensor) => ({
      label: sensor.replace(/_/g, ' '), // Format sensor name for display
      data: data.map((point) => point[sensor] || 0), // Y-axis: Sensor Values
      borderColor: `rgba(${Math.floor(Math.random() * 255)}, ${Math.floor(
        Math.random() * 255
      )}, ${Math.floor(Math.random() * 255)}, 1)`, // Unique color for each dataset
      backgroundColor: 'rgba(0, 0, 0, 0)', // Transparent fill
      tension: 0.4,
    })),
  };

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      tooltip: {
        callbacks: {
          label: function (context) {
            return `${context.dataset.label}: ${context.raw}`;
          },
        },
      },
    },
    scales: {
      x: {
        title: { display: true, text: 'Time' },
        ticks: {
          maxRotation: 45,
          minRotation: 45,
        },
      },
      y: {
        title: { display: true, text: 'Value' },
        beginAtZero: true,
      },
    },
  };

  const handleSensorChange = (e) => {
    const selectedOptions = Array.from(e.target.selectedOptions).map(
      (option) => option.value
    );
    setSelectedSensors(selectedOptions);
  };

  return (
    <div>
      <h2>Historical Data</h2>
      <label htmlFor="sensor-select">Select Sensors:</label>
      <select
        id="sensor-select"
        multiple
        value={selectedSensors}
        onChange={handleSensorChange}
        style={{ margin: '10px', height: '100px', width: '200px' }}
      >
        {sensorKeys.map((sensor) => (
          <option key={sensor} value={sensor}>
            {sensor.replace(/_/g, ' ')} {/* Display friendly names */}
          </option>
        ))}
      </select>
      <Line data={chartData} options={options} />
    </div>
  );
};

export default Chart;
