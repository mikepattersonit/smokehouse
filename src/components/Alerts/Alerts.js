import React, { useState } from 'react';

const Alerts = ({ sensors, alerts, onSetAlert, onRemoveAlert }) => {
  const [selectedSensor, setSelectedSensor] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');

  const handleSave = (e) => {
    e.preventDefault();
    if (!selectedSensor) {
      alert('Please select a sensor');
      return;
    }

    const thresholds = {
      [selectedSensor]: {
        min: min ? parseFloat(min) : null,
        max: max ? parseFloat(max) : null,
        label: sensors.find((sensor) => sensor.id === selectedSensor).label,
      },
    };

    onSetAlert(thresholds);

    // Reset form
    setSelectedSensor('');
    setMin('');
    setMax('');
  };

  return (
    <div>
      <h2>Set Alerts</h2>
      <form onSubmit={handleSave}>
        <label>
          Sensor:
          <select
            value={selectedSensor}
            onChange={(e) => setSelectedSensor(e.target.value)}
          >
            <option value="" disabled>
              Select a sensor
            </option>
            {sensors.map((sensor) => (
              <option key={sensor.id} value={sensor.id}>
                {sensor.label}
              </option>
            ))}
          </select>
        </label>
        <br />
        <label>
          Min Threshold:
          <input
            type="number"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            placeholder="Optional"
          />
        </label>
        <br />
        <label>
          Max Threshold:
          <input
            type="number"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            placeholder="Optional"
          />
        </label>
        <br />
        <button type="submit">Save</button>
      </form>

      <h3>Active Alerts</h3>
      {Object.keys(alerts).length === 0 ? (
        <p>No active alerts</p>
      ) : (
        <ul>
          {Object.entries(alerts).map(([sensorId, alert]) => (
            <li key={sensorId}>
              <strong>{alert.label}:</strong>{' '}
              {alert.min !== null && `Min: ${alert.min} `}
              {alert.max !== null && `Max: ${alert.max} `}
              <button
                style={{ marginLeft: '10px' }}
                onClick={() => onRemoveAlert(sensorId)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Alerts;
