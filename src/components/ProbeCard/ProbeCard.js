// src/components/ProbeCard/ProbeCard.js
import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./ProbeCard.css";

/**
 * Props:
 *  - probe: { id, name, minAlert, maxAlert, mobileNumber, meatType, meatWeight, temperature }
 *  - onSetAlert(id, min, max, mobileNumber)
 *  - onClearAlert?(id)
 *  - onMeatChange(id, meatType, meatWeight)
 *  - meatTypes: [{ name, description? }, ...]  // from your API
 *  - apiEndpoint: string                        // base API (e.g., https://.../ManageProbeAssignments parent-compatible)
 *  - sessionId: string
 */
function ProbeCard({
  probe,
  onSetAlert,
  onClearAlert,
  onMeatChange,
  meatTypes = [],
  apiEndpoint = "",
  sessionId = "",
}) {
  // Local editable state mirrors the probe prop
  const [minAlert, setMinAlert] = useState(probe?.minAlert ?? "");
  const [maxAlert, setMaxAlert] = useState(probe?.maxAlert ?? "");
  const [meatWeight, setMeatWeight] = useState(probe?.meatWeight ?? "");
  const [mobileNumber, setMobileNumber] = useState(probe?.mobileNumber ?? "");
  const [meatType, setMeatType] = useState(probe?.meatType ?? "");
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  // Keep local state in sync when parent probe changes
  useEffect(() => {
    setMinAlert(probe?.minAlert ?? "");
    setMaxAlert(probe?.maxAlert ?? "");
    setMeatWeight(probe?.meatWeight ?? "");
    setMeatType(probe?.meatType ?? "");
    setMobileNumber(probe?.mobileNumber ?? "");
  }, [probe]);

  const disabled = useMemo(() => !sessionId || !probe?.id, [sessionId, probe]);

  const formatUsPhone = useCallback((raw) => {
    if (!raw) return "";
    const digits = raw.replace(/\D/g, "");
    // Accept 10-digit or 11-digit starting with 1
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    return ""; // invalid → caller can handle
  }, []);

  const updateProbeAssignment = useCallback(
    async (fields) => {
      if (!apiEndpoint || !sessionId || !probe?.id) return;
      setSaving(true);
      setErrMsg("");
      try {
        // POST to your backend (kept path identical to your current usage)
        await axios.post(`${apiEndpoint}/updateAssignment`, {
          session_id: sessionId,
          probe_id: probe.id,
          meat_type: fields.meatType,
          weight: fields.meatWeight,
          min_alert: fields.minAlert,
          max_alert: fields.maxAlert,
          mobile_number: fields.mobileNumber,
        });
      } catch (err) {
        console.error("Error updating probe assignment:", err);
        setErrMsg("Failed to save. Check network/API.");
      } finally {
        setSaving(false);
      }
    },
    [apiEndpoint, sessionId, probe?.id]
  );

  // Handlers
  const handleSetAlertClick = useCallback(() => {
    const normalized = formatUsPhone(mobileNumber);
    if (!normalized) {
      setErrMsg("Enter a valid US mobile number (10 digits).");
      return;
    }
    setErrMsg("");
    onSetAlert?.(probe.id, minAlert === "" ? null : Number(minAlert), maxAlert === "" ? null : Number(maxAlert), normalized);
    updateProbeAssignment({
      meatType,
      meatWeight,
      minAlert: minAlert === "" ? null : Number(minAlert),
      maxAlert: maxAlert === "" ? null : Number(maxAlert),
      mobileNumber: normalized,
    });
  }, [formatUsPhone, mobileNumber, onSetAlert, probe?.id, minAlert, maxAlert, meatType, meatWeight, updateProbeAssignment]);

  const handleClearAlertClick = useCallback(() => {
    setMinAlert("");
    setMaxAlert("");
    setMobileNumber("");
    onClearAlert?.(probe.id);
    updateProbeAssignment({
      meatType,
      meatWeight,
      minAlert: null,
      maxAlert: null,
      mobileNumber: null,
    });
  }, [onClearAlert, probe?.id, meatType, meatWeight, updateProbeAssignment]);

  const handleMeatTypeChange = useCallback(
    (e) => {
      const value = e.target.value;
      setMeatType(value);
      onMeatChange?.(probe.id, value, meatWeight);
      updateProbeAssignment({
        meatType: value,
        meatWeight,
        minAlert: minAlert === "" ? null : Number(minAlert),
        maxAlert: maxAlert === "" ? null : Number(maxAlert),
        mobileNumber: mobileNumber || null,
      });
    },
    [probe?.id, meatWeight, onMeatChange, updateProbeAssignment, minAlert, maxAlert, mobileNumber]
  );

  const handleMeatWeightChange = useCallback(
    (e) => {
      const value = e.target.value;
      setMeatWeight(value);
      onMeatChange?.(probe.id, meatType, value);
      updateProbeAssignment({
        meatType,
        meatWeight: value,
        minAlert: minAlert === "" ? null : Number(minAlert),
        maxAlert: maxAlert === "" ? null : Number(maxAlert),
        mobileNumber: mobileNumber || null,
      });
    },
    [probe?.id, meatType, onMeatChange, updateProbeAssignment, minAlert, maxAlert, mobileNumber]
  );

  const handleUseAI = useCallback(async () => {
    if (!apiEndpoint || !sessionId) return;
    setSaving(true);
    setErrMsg("");
    try {
      const resp = await fetch(`${apiEndpoint}/smokehouse-ai-advisor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, probe_id: probe.id }),
      });
      if (!resp.ok) throw new Error("Advisor request failed");
      const data = await resp.json();
      // Keep UX simple for now
      window.alert(`AI Guidance: ${data.advice}`);
    } catch (err) {
      console.error("AI guidance error:", err);
      setErrMsg("AI guidance unavailable right now.");
    } finally {
      setSaving(false);
    }
  }, [apiEndpoint, sessionId, probe?.id]);

  return (
    <div className="probe-card" style={{ marginLeft: 20, opacity: disabled ? 0.6 : 1 }}>
      <div className="probe-card__header">
        <h3 style={{ margin: 0 }}>{probe?.name ?? "Probe"}</h3>
        <div style={{ fontSize: 12, color: "#666" }}>{probe?.id}</div>
      </div>

      <p style={{ marginTop: 6, marginBottom: 14 }}>
        Temperature:&nbsp;
        <strong>{probe?.temperature != null ? `${probe.temperature} °F` : "N/A"}</strong>
      </p>

      {/* Item (formerly Meat) Assignment */}
      <div className="input-group" style={{ marginBottom: 10 }}>
        <label>Item Type:&nbsp;</label>
        <select
          value={meatType}
          onChange={handleMeatTypeChange}
          disabled={disabled || saving}
          style={{ marginLeft: 6, width: 160, padding: 6 }}
        >
          <option value="">Select Item</option>
          {meatTypes.map((t) => (
            <option key={t.name || t.id} value={t.name || t.id}>
              {(t.name || t.id || "").toString()}
            </option>
          ))}
        </select>
      </div>

      <div className="input-group" style={{ marginBottom: 12 }}>
        <label>Weight (lbs):&nbsp;</label>
        <input
          type="number"
          min="0"
          step="0.1"
          value={meatWeight}
          onChange={handleMeatWeightChange}
          disabled={disabled || saving}
          placeholder="e.g. 4.5"
          style={{ width: 100, padding: 6 }}
        />
      </div>

      {/* Alerts */}
      <div className="input-group" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <label>Min Alert:&nbsp;</label>
          <input
            type="number"
            min="0"
            max="300"
            value={minAlert}
            onChange={(e) => setMinAlert(e.target.value)}
            disabled={disabled || saving}
            style={{ width: 90, padding: 6 }}
          />
        </div>
        <div>
          <label>Max Alert:&nbsp;</label>
          <input
            type="number"
            min="0"
            max="300"
            value={maxAlert}
            onChange={(e) => setMaxAlert(e.target.value)}
            disabled={disabled || saving}
            style={{ width: 90, padding: 6 }}
          />
        </div>
        <div>
          <label>Mobile:&nbsp;</label>
          <input
            type="tel"
            value={mobileNumber}
            onChange={(e) => setMobileNumber(e.target.value)}
            disabled={disabled || saving}
            placeholder="(555) 123-4567"
            style={{ width: 160, padding: 6 }}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {minAlert || maxAlert ? (
          <button onClick={handleClearAlertClick} disabled={disabled || saving}>
            Clear Alerts
          </button>
        ) : (
          <button onClick={handleSetAlertClick} disabled={disabled || saving}>
            Save Alerts
          </button>
        )}
        <button onClick={handleUseAI} disabled={disabled || saving}>
          Use AI Guidance
        </button>
      </div>

      {errMsg && (
        <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 13 }}>
          {errMsg}
        </div>
      )}
    </div>
  );
}

export default ProbeCard;
