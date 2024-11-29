import React, { useState } from 'react';

const MeatAssignment = ({ probes, meatTypes, onAssignMeat }) => {
  const [selectedProbes, setSelectedProbes] = useState([]);
  const [selectedMeat, setSelectedMeat] = useState('');
  const [weight, setWeight] = useState('');

  const handleProbeSelection = (probeId) => {
    setSelectedProbes((prev) => {
      if (prev.includes(probeId)) {
        // Remove probe if already selected
        return prev.filter((id) => id !== probeId);
      } else if (prev.length < 3) {
        // Add probe if less than 3 are selected
        return [...prev, probeId];
      } else {
        alert('You can assign up to 3 probes only.');
        return prev;
      }
    });
  };

  const handleAssign = (e) => {
    e.preventDefault();
    if (selectedProbes.length === 0 || !selectedMeat || !weight) {
      alert('Please fill out all fields.');
      return;
    }

    onAssignMeat({
      probes: selectedProbes,
      meat: selectedMeat,
      weight: parseFloat(weight),
    });

    // Reset form
    setSelectedProbes([]);
    setSelectedMeat('');
    setWeight('');
  };

  return (
    <div>
      <h2>Assign Meat to Probes</h2>
      <form onSubmit={handleAssign}>
        <label>
          Select Probes:
          <div>
            {probes.map((probe) => (
              <label key={probe.id} style={{ marginRight: '10px' }}>
                <input
                  type="checkbox"
                  value={probe.id}
                  checked={selectedProbes.includes(probe.id)}
                  onChange={() => handleProbeSelection(probe.id)}
                />
                {probe.label}
              </label>
            ))}
          </div>
        </label>
        <br />
        <label>
          Select Meat Type:
          <select
            value={selectedMeat}
            onChange={(e) => setSelectedMeat(e.target.value)}
          >
            <option value="">Select meat</option>
            {meatTypes.map((meat) => (
              <option key={meat.id} value={meat.name}>
                {meat.name}
              </option>
            ))}
          </select>
        </label>
        <br />
        <label>
          Enter Weight (lbs):
          <input
            type="number"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="e.g., 5.5"
          />
        </label>
        <br />
        <button type="submit">Assign</button>
      </form>
    </div>
  );
};

export default MeatAssignment;
