import React, { useState } from 'react';
import { Line } from 'react-chartjs-2'; // Ensure this import is included
import 'chart.js/auto';

const Chart = ({ data }) => {
  const [selectedSensors, setSelectedSensors] = useState([
    'internal_temp', 'top_temp', 'middle_temp', 'bottom_temp', 'humidity', 'smoke_ppm'
  ]);

  // Function to handle sensor selection from the dropdown
  const handleSensorSelection = (event) => {
    const options = Array.from(event.target.selectedOptions); // Get all selected options
    const values = options.map(option => option.value); // Extract their values
    setSelectedSensors(values);
  };

  // Extract chart data for the selected sensors
  const labels = data.map(item => new Date(item.timestamp).toLocaleTimeString());
  const datasets = selectedSensors.map((sensor) => {
    const sensorLabel = sensor === 'internal_temp' ? 'OUTSIDE TEMP' : sensor.replace(/_/g, ' ').toUpperCase();
    return {
      label: sensorLabel,
      data: data.map(item => item[sensor]),
      fill: false,
      borderColor: `#${Math.floor(Math.random() * 16777215).toString(16)}`, // Random color for each line
      tension: 0.4, // Smooth line curves
    };
  });

  const chartData = {
    labels,
    datasets,
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'left',
        labels: {
          color: '#fff', // White text for dark themes
        },
      },
      tooltip: {
        callbacks: {
          label: (context) => `${context.dataset.label}: ${context.raw}`,
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
    <div style={{ width: '75%', height: '200px', marginBottom: '20px' }}> {/* Outer container for chart */}
      
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}> {/* Dropdown container */}
        <p style={{ color: '#fff', marginRight: '10px' }}>Select sensors to display:</p>
        <select
          multiple
          value={selectedSensors}
          onChange={handleSensorSelection}
          style={{
            width: '300px', // Adjust width here for smaller size
            height: '40px', // Adjust height here for single-line dropdown
            backgroundColor: '#2b2b2b',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: '5px',
            padding: '5px',
          }}
        >
          {['internal_temp', 'top_temp', 'middle_temp', 'bottom_temp', 'humidity', 'smoke_ppm'].map(sensor => (
            <option key={sensor} value={sensor}>
              {sensor === 'internal_temp' ? 'OUTSIDE TEMP' : sensor.replace(/_/g, ' ').toUpperCase()}
            </option>
          ))}
        </select>
      </div>
      <div style={{ width: '100%', height: '100%' }}> {/* Chart container */}
        <Line data={chartData} options={chartOptions} /> {/* Chart.js Line chart */}
      </div>
    </div>
  );
};

export default Chart;
