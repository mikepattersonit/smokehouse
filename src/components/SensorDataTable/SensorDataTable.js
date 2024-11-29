import React, { useState, useEffect } from 'react';

function SensorDataTable() {
  const [sensorData, setSensorData] = useState([]);
  const [timestamp, setTimestamp] = useState(null);

  useEffect(() => {
    // Mock data generation for real-time updates
    const interval = setInterval(() => {
      const mockData = [
        { id: 'internal_temp', label: 'Internal Temp', value: Math.random() * 100 },
        { id: 'sensor0', label: 'Bottom Temp', value: Math.random() * 100 },
        { id: 'sensor1', label: 'Middle Temp', value: Math.random() * 100 },
        { id: 'sensor2', label: 'Top Temp', value: Math.random() * 100 },
        { id: 'humidity', label: 'Humidity (%)', value: Math.random() * 100 },
        { id: 'smoke_ppm', label: 'Smoke PPM', value: Math.random() * 100 },
      ];
      setSensorData(mockData);
      setTimestamp(new Date().toLocaleTimeString());
    }, 2000);

    return () => clearInterval(interval); // Cleanup on unmount
  }, []);

  return (
    <div>
      <h2>Real-Time Sensor Data</h2>
      <p>Last Updated: {timestamp}</p>
      <table border="1" style={{ margin: 'auto', width: '80%', textAlign: 'center' }}>
        <thead>
          <tr>
            <th>Sensor</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {sensorData.map((sensor) => (
            <tr key={sensor.id}>
              <td>{sensor.label}</td>
              <td>{sensor.value.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default SensorDataTable;
