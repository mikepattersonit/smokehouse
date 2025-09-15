// src/components/ProbeCard/ProbeCard.js
import React, { useEffect, useState } from "react";
import "./ProbeCard.css";
import { getAdvisorAdvice } from "../../api";

function ProbeCard({
  probe,
  onSetAlert,
  onClearAlert,
  onMeatChange,
  meatTypes,
  sessionId,
}) {
  // local form state
  const [minAlert, setMinAlert] = useState(probe.minAlert);
  const [maxAlert, setMaxAlert] = useState(probe.maxAlert);
  const [mobileNumber, setMobileNumber] = useState(probe.mobileNumber);
  const [itemType, setItemType] = useState(probe.itemType);
  const [itemWeight, setItemWeight] = useState(probe.itemWeight);

  // advisor UI state
  const [advising, setAdvising] = useState(false);
  const [advice, setAdvice] = useState("");
  const [adviceMeta, setAdviceMeta] = useState(null);
  const [adviceErr, setAdviceErr] = useState("");

  // keep local state in sync when parent updates probe
  useEffect(() => {
    setMinAlert(probe.minAlert);
    setMaxAlert(probe.maxAlert);
    setItemType(probe.itemType);
    setItemWeight(probe.itemWeight);
    setMobileNumber(probe.mobileNumber);
  }, [
    probe.minAlert,
    probe.maxAlert,
    probe.itemType,
    probe.itemWeight,
    probe.mobileNumber,
  ]);

  const handleSetAlertClick = () => {
    const number =
      mobileNumber ||
      window.prompt("Enter your mobile number for alerts:", "");
    if (number) {
      setMobileNumber(number);
      onSetAlert(probe.id, minAlert, maxAlert, number);
    }
  };

  const handleClearAlertClick = () => {
    setMinAlert("");
    setMaxAlert("");
    setMobileNumber("");
    onClearAlert(probe.id);
  };

  const handleItemTypeChange = (e) => {
    const value = e.target.value;
    setItemType(value);
    onMeatChange(probe.id, value, itemWeight);
  };

  const handleItemWeightChange = (e) => {
    const value = e.target.value;
    setItemWeight(value);
    onMeatChange(probe.id, itemType, value);
  };

  const handleUseAI = async () => {
    if (!sessionId) {
      setAdviceErr("No active session yet.");
      return;
    }
    setAdvising(true);
    setAdviceErr("");
    try {
      const res = await getAdvisorAdvice(sessionId, probe.id);
      setAdvice(res?.advice || "(No advice text returned)");
      setAdviceMeta({
        used_fallback: !!res?.used_fallback,
        model: res?.model || "unknown",
      });
    } catch (e) {
      setAdvice("");
      setAdviceMeta(null);
      setAdviceErr(String(e.message || e));
    } finally {
      setAdvising(false);
    }
  };

  return (
    <div className="probe-card" style={{ marginLeft: 20, minWidth: 300 }}>
      <h3 style={{ marginTop: 0 }}>{probe.name}</h3>
      <p>
        Temperature:{" "}
        {probe.temperature !== null ? `${probe.temperature} °F` : "N/A"}
      </p>

      {/* Alerts */}
      <div className="input-group" style={{ display: "flex", gap: 8 }}>
        <label style={{ minWidth: 80 }}>Min Alert:</label>
        <input
          type="number"
          value={minAlert}
          onChange={(e) => setMinAlert(e.target.value)}
          min={0}
          max={300}
          style={{ width: 90, padding: 5 }}
        />
      </div>

      <div className="input-group" style={{ display: "flex", gap: 8 }}>
        <label style={{ minWidth: 80 }}>Max Alert:</label>
        <input
          type="number"
          value={maxAlert}
          onChange={(e) => setMaxAlert(e.target.value)}
          min={0}
          max={300}
          style={{ width: 90, padding: 5 }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        {minAlert || maxAlert ? (
          <button onClick={handleClearAlertClick}>Clear Alert</button>
        ) : (
          <button onClick={handleSetAlertClick}>Set Alert</button>
        )}
        <input
          type="tel"
          placeholder="Mobile #"
          value={mobileNumber}
          onChange={(e) => setMobileNumber(e.target.value)}
          style={{ width: 140, padding: 5 }}
        />
      </div>

      {/* Assignment */}
      <div className="input-group" style={{ marginTop: 12 }}>
        <label>Item Type:</label>
        <select
          value={itemType}
          onChange={handleItemTypeChange}
          style={{ marginLeft: 10, width: 140, padding: 5 }}
        >
          <option value="">Select</option>
          {(meatTypes || []).map((m) => (
            <option key={m.name || m.id} value={m.name || m.id}>
              {(m.name || m.id || "").toString()}
            </option>
          ))}
        </select>
      </div>

      <div className="input-group" style={{ marginTop: 8 }}>
        <label>Weight (lbs):</label>
        <input
          type="number"
          value={itemWeight}
          onChange={handleItemWeightChange}
          placeholder="e.g. 12"
          style={{ marginLeft: 10, width: 90, padding: 5 }}
        />
      </div>

      {/* AI Guidance */}
      <div
        style={{
          marginTop: 14,
          paddingTop: 10,
          borderTop: "1px solid #e5e7eb",
        }}
      >
        <button onClick={handleUseAI} disabled={advising || !sessionId}>
          {advising ? "Getting advice…" : "AI Guidance"}
        </button>
        {!sessionId && (
          <span style={{ marginLeft: 8, color: "#b91c1c" }}>
            Waiting on session…
          </span>
        )}

        {adviceErr && (
          <div
            style={{
              marginTop: 8,
              padding: "8px 10px",
              background: "#FEF2F2",
              color: "#991B1B",
              border: "1px solid #FCA5A5",
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            {adviceErr}
          </div>
        )}

        {advice && (
          <div
            style={{
              marginTop: 8,
              padding: "10px 12px",
              background: "#F1F5F9",
              border: "1px solid #CBD5E1",
              borderRadius: 8,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Advisor</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{advice}</div>
            {adviceMeta && (
              <div style={{ marginTop: 6, fontSize: 12, color: "#475569" }}>
                {adviceMeta.used_fallback ? "Heuristic" : "AI"} · model:{" "}
                <code>{adviceMeta.model}</code>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ProbeCard;
