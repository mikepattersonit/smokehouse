// ProbeCard.js (Updated with Use AI functionality and API interaction for assignments)
import React, { useState, useEffect } from 'react';
import './ProbeCard.css';
import axios from 'axios';

function ProbeCard({ probe, onSetAlert, onClearAlert, onMeatChange, meatTypes, apiEndpoint, sessionId }) {
  const [minAlert, setMinAlert] = useState(probe.minAlert);
  const [maxAlert, setMaxAlert] = useState(probe.maxAlert);
  const [meatWeight, setMeatWeight] = useState(probe.meatWeight);
  const [mobileNumber, setMobileNumber] = useState(probe.mobileNumber);
  const [meatType, setMeatType] = useState(probe.meatType);

  useEffect(() => {
    // Sync probe state with parent state if it changes
    setMinAlert(probe.minAlert);
    setMaxAlert(probe.maxAlert);
    setMeatWeight(probe.meatWeight);
    setMeatType(probe.meatType);
    setMobileNumber(probe.mobileNumber);
  }, [probe]);

  const handleSetAlertClick = () => {
    const number = prompt('Enter your mobile number for alerts:', mobileNumber || '');
    if (number) {
      setMobileNumber(number);
      onSetAlert(probe.id, minAlert, maxAlert, number);
      updateProbeAssignment(probe.id, meatType, meatWeight, minAlert, maxAlert, number);
    }
  };

  const handleClearAlertClick = () => {
    setMinAlert('');
    setMaxAlert('');
    setMobileNumber('');
    onClearAlert(probe.id);
    updateProbeAssignment(probe.id, meatType, meatWeight, null, null, null);
  };

  const handleMeatChange = (event) => {
    const value = event.target.value;
    setMeatType(value);
    onMeatChange(probe.id, value, meatWeight);
    updateProbeAssignment(probe.id, value, meatWeight, minAlert, maxAlert, mobileNumber);
  };

  const handleMeatWeightChange = (event) => {
    const value = event.target.value;
    setMeatWeight(value);
    onMeatChange(probe.id, meatType, value);
    updateProbeAssignment(probe.id, meatType, value, minAlert, maxAlert, mobileNumber);
  };

  const handleUseAI = async () => {
    try {
      const response = await fetch(`${apiEndpoint}/smokehouse-ai-advisor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          session_id: sessionId,
          probe_id: probe.id
        })
      });
      if (!response.ok) {
        throw new Error('Error fetching AI guidance');
      }
      const data = await response.json();
      alert(`AI Guidance: ${data.advice}`);
    } catch (error) {
      console.error('Error using AI:', error);
      alert('Unable to get AI guidance at the moment.');
    }
  };

  const updateProbeAssignment = async (probeId, meatType, weight, minAlert, maxAlert, mobileNumber) => {
    try {
      const response = await axios.post(`${apiEndpoint}/updateAssignment`, {
        session_id: sessionId,
        probe_id: probeId,
        meat_type: meatType,
        weight: weight,
        min_alert: minAlert,
        max_alert: maxAlert,
        mobile_number: mobileNumber
      });

      if (response.status === 200) {
        console.log('Probe assignment updated successfully in the database');
      } else {
        console.error('Failed to update probe assignment in the database');
      }
    } catch (error) {
      console.error('Error updating probe assignment:', error);
    }
  };

  return (
    <div className="probe-card" style={{ marginLeft: '20px' }}> {/* Added left margin here */}
      <h3>{probe.name}</h3>
      <p>Temperature: {probe.temperature !== null ? `${probe.temperature} °F` : 'N/A'}</p>
      <div className="input-group">
        <label>Min Alert:</label>
        <input 
          type="number" 
          value={minAlert} 
          onChange={(e) => setMinAlert(e.target.value)} 
          min={0} 
          max={300} 
          style={{
            width: '80px', // Adjusted width here
            padding: '5px',
            marginRight: '10px',
          }}
        />
      </div>

      <div className="input-group">
        <label>Max Alert:</label>
        <input 
          type="number" 
          value={maxAlert} 
          onChange={(e) => setMaxAlert(e.target.value)} 
          min={0} 
          max={300} 
          style={{
            width: '80px', // Adjusted width here
            padding: '5px',
            marginRight: '10px',
          }}
        />
      </div>

      {minAlert || maxAlert ? (
        <button onClick={handleClearAlertClick}>Clear Alert</button>
      ) : (
        <button onClick={handleSetAlertClick}>Set Alert</button> 
      )}

      <button onClick={handleUseAI}>AI Guidance</button>

      <div className="input-group">
        <label>Meat Type:</label>
        <select 
          value={meatType} 
          onChange={handleMeatChange} 
          style={{
            marginLeft: '20px', // Added left margin for better alignment
            width: '80px', // Adjusted width here
            padding: '5px',
            marginRight: '10px',
          }}
        >
          <option value="">Select Meat</option>
          {meatTypes.map((meat) => (
            <option key={meat.id} value={meat.name}>{meat.name}</option>
          ))}
        </select>
      </div>

      <div className="input-group">
        <label>Weight (lbs):</label>
        <input 
          type="number" 
          value={meatWeight} 
          onChange={handleMeatWeightChange} 
          placeholder="Enter weight in lbs" 
          style={{
            marginLeft: '10px', // Added left margin for better alignment
            width: '80px', // Adjusted width here
            padding: '5px',
          }}
        />
      </div>
    </div>
  );
}

export default ProbeCard;