// src/components/ProbeCard/ProbeCard.js
import React, { useEffect, useState, useCallback } from "react";
import "./ProbeCard.css";
import { postAdvisor } from "../../api";
import AdvisorPanel from "./AdvisorPanel";

function ProbeCard({
  probe,
  onSetAlert,
  onClearAlert,
  onMeatChange,
  meatTypes = [],
  sessionId,
  onApplyPitTemp,
}) {
  const [minAlert,     setMinAlert]     = useState(probe.minAlert     ?? "");
  const [maxAlert,     setMaxAlert]     = useState(probe.maxAlert     ?? "");
  const [mobileNumber, setMobileNumber] = useState(probe.mobileNumber ?? "");
  const [itemType,     setItemType]     = useState(probe.itemType     ?? "");
  const [itemWeight,   setItemWeight]   = useState(probe.itemWeight   ?? "");
  const [advisorBusy,  setAdvisorBusy]  = useState(false);
  const [advice,       setAdvice]       = useState(null);
  const [adviceCached, setAdviceCached] = useState(false);

  // Only re-sync when the probe itself changes (avoid clobbering user typing)
  useEffect(() => {
    setMinAlert(probe.minAlert     ?? "");
    setMaxAlert(probe.maxAlert     ?? "");
    setMobileNumber(probe.mobileNumber ?? "");
    setItemType(probe.itemType     ?? "");
    setItemWeight(probe.itemWeight ?? "");
    setAdvice(null);
  }, [probe.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveItemDetails = useCallback(() => {
    onMeatChange?.(probe.id, itemType, itemWeight);
  }, [onMeatChange, probe.id, itemType, itemWeight]);

  const saveAlerts = useCallback(() => {
    onSetAlert?.(probe.id, minAlert, maxAlert, mobileNumber);
  }, [onSetAlert, probe.id, minAlert, maxAlert, mobileNumber]);

  const clearAlerts = useCallback(() => {
    setMinAlert("");
    setMaxAlert("");
    setMobileNumber("");
    onClearAlert?.(probe.id);
  }, [onClearAlert, probe.id]);

  const handleAdvisor = useCallback(async () => {
    if (!sessionId) return;
    setAdvisorBusy(true);
    try {
      const res = await postAdvisor({ session_id: sessionId, probe_id: probe.id });
      if (!res || res.error) throw new Error(res?.error || "Advisor error");
      setAdvice(res.advice);
      setAdviceCached(res.cached ?? false);
    } catch (err) {
      console.error("Advisor error:", err); // eslint-disable-line no-console
      setAdvice({ notes: "Unable to get AI guidance right now. Please try again." });
      setAdviceCached(false);
    } finally {
      setAdvisorBusy(false);
    }
  }, [sessionId, probe.id]);

  const hasItem = Boolean(itemType);

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
          value={itemType}
          onChange={(e) => setItemType(e.target.value)}
          onBlur={saveItemDetails}
          style={{ marginLeft: 12, width: 180, padding: 5, marginRight: 10 }}
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
          value={itemWeight}
          onChange={(e) => setItemWeight(e.target.value)}
          onBlur={saveItemDetails}
          placeholder="e.g. 4.5"
          style={{ marginLeft: 10, width: 100, padding: 5 }}
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

      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <button onClick={saveAlerts}>Save Alerts</button>
        {(minAlert || maxAlert || mobileNumber) && (
          <button onClick={clearAlerts}>Clear Alerts</button>
        )}
        {hasItem && (
          <button onClick={handleAdvisor} disabled={advisorBusy}>
            {advisorBusy ? "Getting AI..." : "AI Guidance"}
          </button>
        )}
      </div>

      {advice && (
        <AdvisorPanel
          advice={advice}
          cached={adviceCached}
          onApplyPitTemp={onApplyPitTemp}
        />
      )}
    </div>
  );
}

export default ProbeCard;
