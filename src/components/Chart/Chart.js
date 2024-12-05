// Chart.js (Updated)
import React, { useState } from 'react';
import { Line } from 'react-chartjs-2';
import 'chart.js/auto';

const Chart = ({ data }) => {
  const [selectedSensors, setSelectedSensors] = useState([
    'internal_temp', 'top_temp', 'middle_temp', 'bottom_temp', 'humidity', 'smoke_ppm'
  ]);

  // Function to handle sensor selection
  const handleSensorSelection = (event) => {
    const { value, checked } = event.target;
    setSelectedSensors((prevSelected) => 
      checked ? [...prevSelected, value] : prevSelected.filter(sensor => sensor !== value)
    );
  };

  // Extract chart data for the selected sensors
  const labels = data.map(item => new Date(item.timestamp).toLocaleTimeString());
  const datasets = selectedSensors.map((sensor) => {
    const sensorLabel = sensor === 'internal_temp' ? 'OUTSIDE TEMP' : sensor.replace(/_/g, ' ').toUpperCase();
    return {
      label: sensorLabel,
      data: data.map(item => item[sensor]),
      fill: false,
      borderColor: `#${Math.floor(Math.random()*16777215).toString(16)}`, // Random color for each line
    };
  });

  const chartData = {
    labels,
    datasets,
  };

  return (
    <div>
      <h2>Smokehouse Status Trends</h2>
      <div>
        <p>Select sensors to display:</p>
        {['internal_temp', 'top_temp', 'middle_temp', 'bottom_temp', 'humidity', 'smoke_ppm'].map(sensor => (
          <label key={sensor} style={{ marginRight: '10px' }}>
            <input
              type="checkbox"
              value={sensor}
              checked={selectedSensors.includes(sensor)}
              onChange={handleSensorSelection}
            />
            {sensor === 'internal_temp' ? 'OUTSIDE TEMP' : sensor.replace(/_/g, ' ').toUpperCase()}
          </label>
        ))}
      </div>
      <Line data={chartData} />
    </div>
  );
};

export default Chart;
