import React from 'react';

function SensorDataTable({ data }) {
  if (!data || data.length === 0) {
    return (
      <div>
        <h2>Real-Time Sensor Data</h2>
        <p>No sensor data available.</p>
      </div>
    );
  }

  // Define the desired sensor display order
  const sensorOrder = [
    'internal_temp',
    'top_temp',
    'middle_temp',
    'bottom_temp',
    'probe1_temp',
    'probe2_temp',
    'probe3_temp',
    'humidity',
    'smoke_ppm',
  ];

  return (
    <div>
      <h2>Real-Time Sensor Data</h2>
      <p>Last Updated: {new Date(data[0].timestamp).toLocaleTimeString()}</p>
      <table border="1" style={{ margin: 'auto', width: '80%', textAlign: 'center' }}>
        <thead>
          <tr>
            <th>Sensor</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {sensorOrder.map((sensorKey) => {
            if (data[0][sensorKey] !== undefined) {
              return (
                <tr key={sensorKey}>
                  <td>{sensorKey.replace(/_/g, ' ').toUpperCase()}</td>
                  <td>{data[0][sensorKey]}</td>
                </tr>
              );
            }
            return null; // Skip if the sensor key doesn't exist in the data
          })}
        </tbody>
      </table>
    </div>
  );
}

export default SensorDataTable;
