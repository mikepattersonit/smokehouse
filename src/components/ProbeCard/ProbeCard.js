// ProbeCard.js
import React, { useState } from 'react';
import './ProbeCard.css';

function ProbeCard({ probe, onSetAlert, onClearAlert, onMeatChange, meatTypes, minTemp, maxTemp, temperature }) {
  const [minAlert, setMinAlert] = useState(probe.minAlert);
  const [maxAlert, setMaxAlert] = useState(probe.maxAlert);
  const [meatWeight, setMeatWeight] = useState(probe.meatWeight);

  const handleSetAlertClick = () => {
    const mobileNumber = prompt('Enter your mobile number for alerts:');
    if (mobileNumber) {
      onSetAlert(probe.id, minAlert, maxAlert, mobileNumber);
    }
  };

  const handleClearAlertClick = () => {
    setMinAlert('');
    setMaxAlert('');
    onClearAlert(probe.id);
  };

  const handleMeatChange = (event) => {
    onMeatChange(probe.id, event.target.value, meatWeight);
  };

  const handleMeatWeightChange = (event) => {
    setMeatWeight(event.target.value);
    onMeatChange(probe.id, probe.meatType, event.target.value);
  };

  return (
    <div className="probe-card">
      <h3>{probe.name}</h3>
      <p>Temperature: {temperature !== null ? `${temperature} °F` : 'N/A'}</p> {/* Adding temperature display */}
      <div className="input-group">
        <label>Min Alert:</label>
        <input type="number" value={minAlert} onChange={(e) => setMinAlert(e.target.value)} min={minTemp} max={300} />
      </div>

      <div className="input-group">
        <label>Max Alert:</label>
        <input type="number" value={maxAlert} onChange={(e) => setMaxAlert(e.target.value)} min={minTemp} max={300} />
      </div>

      {minAlert || maxAlert ? (
        <button onClick={handleClearAlertClick}>Clear Alert</button>
      ) : (
        <button onClick={handleSetAlertClick}>Set Alert</button>
      )}

      <div className="input-group">
        <label>Meat Assignment:</label>
        <select value={probe.meatType} onChange={handleMeatChange}>
          <option value="">Select Meat</option>
          {meatTypes.map((meat) => (
            <option key={meat.id} value={meat.name}>{meat.name}</option>
          ))}
        </select>
      </div>

      <div className="input-group">
        <label>Meat Weight (lbs):</label>
        <input type="number" value={meatWeight} onChange={handleMeatWeightChange} placeholder="Enter weight in lbs" />
      </div>
    </div>
  );
}

export default ProbeCard;
