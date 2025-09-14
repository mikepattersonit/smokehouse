// src/components/ProbeCard/ProbeCard.js
import React, { useEffect, useState, useCallback } from "react";
import "./ProbeCard.css";
import axios from "axios";

function ProbeCard({
  probe,
  onSetAlert,
  onClearAlert,
  onMeatChange,
  meatTypes = [],
  apiEndpoint,
  sessionId,
}) {
  // Local, form-controlled state
  const [minAlert, setMinAlert] = useState(probe.minAlert ?? "");
  const [maxAlert, setMaxAlert] = useState(probe.maxAlert ?? "");
  const [mobileNumber, setMobileNumber] = useState(probe.mobileNumber ?? "");
  const [meatType, setMeatType] = useState(probe.meatType ?? "");
  const [meatWeight, setMeatWeight] = useState(probe.meatWeight ?? "");

  // Only resync when the *probe identity* changes (avoid overwriting while typing)
  useEffect(() => {
    setMinAlert(probe.minAlert ?? "");
    setMaxAlert(probe.maxAlert ?? "");
    setMobileNumber(probe.mobileNumber ?? "");
    setMeatType(probe.meatType ?? "");
    setMeatWeight(probe.meatWeight ?? "");
  }, [probe.id]); // <— key change

  const persistAssignment = useCallback(
    async (payload) => {
      if (!apiEndpoint || !sessionId) return;
      try {
        await axios.post(`${apiEndpoint}/updateAssignment`, payload);
        // optional toast/log here
      } catch (err) {
        console.error("Error updating probe assignment:", err);
      }
    },
    [apiEndpoint, sessionId]
  );

  // Save item-type / weight on blur or Save button
  const saveItemDetails = useCallback(() => {
    onMeatChange?.(probe.id, meatType, meatWeight);
    persistAssignment({
      session_id: sessionId,
      probe_id: probe.id,
      meat_type: meatType,
      weight: meatWeight,
      min_alert: minAlert || null,
      max_alert: maxAlert || null,
      mobile_number: mobileNumber || null,
    });
  }, [probe.id, meatType, meatWeight, minAlert, maxAlert, mobileNumber, onMeatChange, persistAssignment, sessionId]);

  // Alerts
  const saveAlerts = useCallback(() => {
    onSetAlert?.(probe.id, minAlert, maxAlert, mobileNumber);
    persistAssignment({
      session_id: sessionId,
      probe_id: probe.id,
      meat_type: meatType,
      weight: meatWeight,
      min_alert: minAlert || null,
      max_alert: maxAlert || null,
      mobile_number: mobileNumber || null,
    });
  }, [probe.id, minAlert, maxAlert, mobileNumber, meatType, meatWeight, onSetAlert, persistAssignment, sessionId]);

  const clearAlerts = useCallback(() => {
    setMinAlert("");
    setMaxAlert("");
    setMobileNumber("");
    onClearAlert?.(probe.id);
    persistAssignment({
      session_id: sessionId,
      probe_id: probe.id,
      meat_type: meatType,
      weight: meatWeight,
      min_alert: null,
      max_alert: null,
      mobile_number: null,
    });
  }, [probe.id, onClearAlert, persistAssignment, sessionId, meatType, meatWeight]);

  return (
    <div className="probe-card" style={{ marginLeft: "20px" }}>
      <h3>{probe.name}</h3>
      <p>
        Temperature:{" "}
        {probe.temperature !== null && probe.temperature !== undefined
          ? `${probe.temperature} °F`
          : "N/A"}
      </p>

      {/* Item type */}
      <div className="input-group">
        <label>Item Type:</label>
        <select
          value={meatType}
          onChange={(e) => setMeatType(e.target.value)}
          onBlur={saveItemDetails}
          style={{ marginLeft: "12px", width: 180, padding: 5, marginRight: 10 }}
        >
          <option value="">Select Item</option>
          {meatTypes.map((it) => (
            <option key={it.name} value={it.name}>
              {it.name}
            </option>
          ))}
        </select>
      </div>

      {/* Weight */}
      <div className="input-group">
        <label>Weight (lbs):</label>
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          min="0"
          value={meatWeight}
          onChange={(e) => setMeatWeight(e.target.value)}
          onBlur={saveItemDetails}
          placeholder="e.g. 4.5"
          style={{ marginLeft: "10px", width: 100, padding: 5 }}
        />
      </div>

      {/* Alerts */}
      <div className="input-group">
        <label>Min Alert:</label>
        <input
          type="number"
          inputMode="numeric"
          min="0"
          max="300"
          value={minAlert}
          onChange={(e) => setMinAlert(e.target.value)}
          style={{ width: 90, padding: 5, marginRight: 10, marginLeft: 8 }}
        />
      </div>

      <div className="input-group">
        <label>Max Alert:</label>
        <input
          type="number"
          inputMode="numeric"
          min="0"
          max="300"
          value={maxAlert}
          onChange={(e) => setMaxAlert(e.target.value)}
          style={{ width: 90, padding: 5, marginRight: 10, marginLeft: 8 }}
        />
      </div>

      <div className="input-group">
        <label>Mobile:</label>
        <input
          type="tel"
          placeholder="(555) 123-4567"
          value={mobileNumber}
          onChange={(e) => setMobileNumber(e.target.value)}
          style={{ width: 160, padding: 5, marginLeft: 8 }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button onClick={saveAlerts}>Save Alerts</button>
        {(minAlert || maxAlert || mobileNumber) && (
          <button onClick={clearAlerts}>Clear Alerts</button>
        )}
      </div>

      <div style={{ marginTop: 8 }}>
        <button
          onClick={async () => {
            try {
              const resp = await fetch(`${apiEndpoint}/smokehouse-ai-advisor`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ session_id: sessionId, probe_id: probe.id }),
              });
              const json = await resp.json();
              alert(`AI Guidance: ${json.advice ?? "No advice returned."}`);
            } catch (e) {
              console.error(e);
              alert("Unable to get AI guidance right now.");
            }
          }}
        >
          Use AI Guidance
        </button>
      </div>
    </div>
  );
}

export default ProbeCard;
