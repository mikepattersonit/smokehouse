// src/components/ProbeCard/ProbeCard.js
import React, { useEffect, useState, useCallback, useMemo } from "react";
import "./ProbeCard.css";
import { postAdvisor } from "../../api";
import AdvisorPanel from "./AdvisorPanel";
import ProbeChart from "./ProbeChart";

function elapsedMinutes(sessionId, timestamp) {
  try {
    const s = String(sessionId);
    if (s.length < 14) return null;
    const startSec =
      parseInt(s.slice(8, 10)) * 3600 +
      parseInt(s.slice(10, 12)) * 60 +
      parseInt(s.slice(12, 14));
    const ts = String(timestamp).trim();
    let endSec;
    if (ts.length === 6 && /^\d{6}$/.test(ts)) {
      endSec =
        parseInt(ts.slice(0, 2)) * 3600 +
        parseInt(ts.slice(2, 4)) * 60 +
        parseInt(ts.slice(4, 6));
    } else {
      return null;
    }
    let diff = endSec - startSec;
    if (diff < 0) diff += 86400;
    return Math.max(0, Math.floor(diff / 60));
  } catch {
    return null;
  }
}

function fmtElapsed(minutes) {
  if (minutes === null || minutes === undefined) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function computeRateOfRise(data, probeId, window = 10) {
  // data is newest-first; take last `window` valid readings
  const vals = data
    .map((r) => r[probeId])
    .filter((v) => v != null && parseFloat(v) !== -999)
    .slice(0, window)
    .map((v) => parseFloat(v));
  if (vals.length < 2) return null;
  const oldest = vals[vals.length - 1];
  const newest = vals[0];
  const delta = newest - oldest;
  // ~1 reading/min → convert delta over (window-1) readings to °F/hr
  return Math.round((delta / (vals.length - 1)) * 60 * 10) / 10;
}

function ProbeCard({ probe, data = [], sessionId, itemTypes = [], onSetAlert, onClearAlert, onItemChange, onApplyPitTemp }) {
  const [itemType,    setItemType]    = useState(probe.itemType   ?? "");
  const [itemWeight,  setItemWeight]  = useState(probe.itemWeight ?? "");
  const [minAlert,    setMinAlert]    = useState(probe.minAlert   ?? "");
  const [maxAlert,    setMaxAlert]    = useState(probe.maxAlert   ?? "");
  const [configOpen,  setConfigOpen]  = useState(false);
  const [advisorBusy, setAdvisorBusy] = useState(false);
  const [advice,      setAdvice]      = useState(null);
  const [adviceCached, setAdviceCached] = useState(false);

  useEffect(() => {
    setItemType(probe.itemType   ?? "");
    setItemWeight(probe.itemWeight ?? "");
    setMinAlert(probe.minAlert   ?? "");
    setMaxAlert(probe.maxAlert   ?? "");
    setAdvice(null);
  }, [probe.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const rateOfRise = useMemo(() => computeRateOfRise(data, probe.id), [data, probe.id]);

  const elapsed = useMemo(() => {
    const latestRow = data[0];
    if (!latestRow || !sessionId) return null;
    return elapsedMinutes(sessionId, latestRow.timestamp);
  }, [data, sessionId]);

  const hasItem = Boolean(itemType);

  const saveItemDetails = useCallback(() => {
    onItemChange?.(probe.id, itemType, itemWeight);
  }, [onItemChange, probe.id, itemType, itemWeight]);

  const saveAlerts = useCallback(() => {
    onSetAlert?.(probe.id, minAlert, maxAlert);
    setConfigOpen(false);
  }, [onSetAlert, probe.id, minAlert, maxAlert]);

  const clearAlerts = useCallback(() => {
    setMinAlert("");
    setMaxAlert("");
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

  const temp = probe.temperature;
  const hasTemp = temp !== null && temp !== undefined;

  function rateLabel(ror) {
    if (ror === null) return null;
    const sign = ror >= 0 ? "+" : "";
    return `${sign}${ror}°/hr`;
  }

  return (
    <div className={`probe-card${hasItem ? " probe-card--active" : ""}`}>
      {/* Header */}
      <div className="probe-card__header">
        <span className="probe-card__name">{probe.name}</span>
        {hasItem
          ? <span className="probe-card__tag probe-card__tag--assigned">{itemType}{itemWeight ? ` · ${itemWeight} lb` : ""}</span>
          : <span className="probe-card__tag probe-card__tag--empty">Unassigned</span>
        }
      </div>

      {/* Temperature */}
      {hasTemp
        ? (
          <div className="probe-card__temp-block">
            <span className="probe-card__temp">{Math.round(temp)}</span>
            <span className="probe-card__temp-unit">°F</span>
          </div>
        ) : (
          <div className="probe-card__temp-block">
            <span className="probe-card__temp probe-card__temp--na">—</span>
          </div>
        )
      }

      {/* Meta row */}
      {(rateOfRise !== null || elapsed !== null) && (
        <div className="probe-card__meta">
          {rateLabel(rateOfRise) && <strong>{rateLabel(rateOfRise)}</strong>}
          {rateOfRise !== null && elapsed !== null && <span className="probe-card__meta-sep">·</span>}
          {elapsed !== null && <span>{fmtElapsed(elapsed)} elapsed</span>}
        </div>
      )}

      {/* Mini sparkline */}
      <ProbeChart probe={probe} data={data} />

      {/* AI advisor result */}
      {advice && (
        <AdvisorPanel
          advice={advice}
          cached={adviceCached}
          onApplyPitTemp={onApplyPitTemp}
        />
      )}

      {/* Actions */}
      <div className="probe-card__actions">
        {hasItem && (
          <button
            className="probe-btn probe-btn--ai"
            onClick={handleAdvisor}
            disabled={advisorBusy}
          >
            {advisorBusy ? "Getting AI…" : advice ? "↻ Refresh AI" : "🤖 AI Guidance"}
          </button>
        )}
        <button
          className="probe-btn probe-btn--config"
          onClick={() => setConfigOpen((o) => !o)}
        >
          {configOpen ? "✕ Close" : "⚙ Configure"}
        </button>
      </div>

      {/* Collapsible config */}
      {configOpen && (
        <div className="probe-card__config">
          <div className="config-row">
            <label>Item</label>
            <select
              value={itemType}
              onChange={(e) => setItemType(e.target.value)}
              onBlur={saveItemDetails}
            >
              <option value="">Select item…</option>
              {itemTypes.map((it) => (
                <option key={it.name} value={it.name}>{it.name}</option>
              ))}
            </select>
          </div>
          <div className="config-row">
            <label>Weight</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              value={itemWeight}
              onChange={(e) => setItemWeight(e.target.value)}
              onBlur={saveItemDetails}
              placeholder="lbs"
            />
          </div>
          <div className="config-row">
            <label>Alert °F</label>
            <div className="config-alert-range">
              <input
                type="number"
                inputMode="numeric"
                value={minAlert}
                onChange={(e) => setMinAlert(e.target.value)}
                placeholder="Min"
              />
              <span>–</span>
              <input
                type="number"
                inputMode="numeric"
                value={maxAlert}
                onChange={(e) => setMaxAlert(e.target.value)}
                placeholder="Max"
              />
            </div>
          </div>
          <div className="config-actions">
            <button className="probe-btn probe-btn--save" onClick={saveAlerts}>Save</button>
            {(minAlert || maxAlert) && (
              <button className="probe-btn probe-btn--clear" onClick={clearAlerts}>Clear alerts</button>
            )}
          </div>
        </div>
      )}

      {/* Empty state CTA */}
      {!hasItem && !configOpen && (
        <div className="probe-card__empty">
          <div className="probe-card__empty-text">Assign an item to enable AI guidance and alerts.</div>
          <button className="probe-btn probe-btn--assign" onClick={() => setConfigOpen(true)}>
            + Assign Item
          </button>
        </div>
      )}
    </div>
  );
}

export default ProbeCard;
