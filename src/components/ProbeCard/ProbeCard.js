// src/components/ProbeCard/ProbeCard.js
import React, { useEffect, useState, useCallback, useMemo } from "react";
import "./ProbeCard.css";
import { postAdvisor } from "../../api";
import AdvisorPanel from "./AdvisorPanel";
import ProbeChart from "./ProbeChart";
import { toDisplay, fromDisplay, unitLabel } from "../../utils/temperature";

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
  const vals = data
    .map((r) => r[probeId])
    .filter((v) => v != null && parseFloat(v) !== -999)
    .slice(0, window)
    .map((v) => parseFloat(v));
  if (vals.length < 2) return null;
  const oldest = vals[vals.length - 1];
  const newest = vals[0];
  const delta = newest - oldest;
  return Math.round((delta / (vals.length - 1)) * 60 * 10) / 10;
}

function ProbeCard({ probe, data = [], sessionId, itemTypes = [], unit = "F", onSetAlert, onClearAlert, onItemChange, onApplyPitTemp, availablePartners = [], onGroupWith }) {
  const [itemType,     setItemType]     = useState(probe.itemType   ?? "");
  const [itemWeight,   setItemWeight]   = useState(probe.itemWeight ?? "");
  // alerts stored internally in °F
  const [minAlertF,    setMinAlertF]    = useState(probe.minAlert   ?? "");
  const [maxAlertF,    setMaxAlertF]    = useState(probe.maxAlert   ?? "");
  const [configOpen,   setConfigOpen]   = useState(false);
  const [advisorBusy,  setAdvisorBusy]  = useState(false);
  const [advice,       setAdvice]       = useState(null);
  const [adviceCached, setAdviceCached] = useState(false);

  useEffect(() => {
    setItemType(probe.itemType   ?? "");
    setItemWeight(probe.itemWeight ?? "");
    setMinAlertF(probe.minAlert  ?? "");
    setMaxAlertF(probe.maxAlert  ?? "");
    setAdvice(null);
  }, [probe.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedItem = useMemo(
    () => itemTypes.find((it) => it.name === itemType) || null,
    [itemTypes, itemType]
  );

  const isColdSmoke = selectedItem?.smoke_type === "cold";
  const ul = unitLabel(unit);

  const handleItemTypeChange = useCallback((e) => {
    const name = e.target.value;
    setItemType(name);
    const item = itemTypes.find((it) => it.name === name);
    if (!item) return;
    if (item.smoke_type === "cold" && item.max_safe_temp_f != null) {
      setMaxAlertF(String(item.max_safe_temp_f));
      setMinAlertF("");
    } else if (item.target_internal_temp_f != null) {
      setMaxAlertF(String(item.target_internal_temp_f));
      setMinAlertF("");
    }
  }, [itemTypes]);

  const rateOfRiseF = useMemo(() => computeRateOfRise(data, probe.id), [data, probe.id]);

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
    onSetAlert?.(probe.id, minAlertF, maxAlertF);
    setConfigOpen(false);
  }, [onSetAlert, probe.id, minAlertF, maxAlertF]);

  const clearAlerts = useCallback(() => {
    setMinAlertF("");
    setMaxAlertF("");
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

  const temp    = probe.temperature; // always °F
  const hasTemp = temp !== null && temp !== undefined;
  const tempDisplay = hasTemp ? toDisplay(temp, unit) : null;

  function rateLabel(rorF) {
    if (rorF === null) return null;
    const rorDisplay = unit === "C"
      ? Math.round(rorF * 5 / 9 * 10) / 10  // convert delta °F/hr to delta °C/hr
      : rorF;
    const sign = rorDisplay >= 0 ? "+" : "";
    return `${sign}${rorDisplay}${ul}/hr`;
  }

  function tempHint() {
    if (!selectedItem) return null;
    if (isColdSmoke && selectedItem.max_safe_temp_f != null) {
      const v = toDisplay(selectedItem.max_safe_temp_f, unit);
      return { text: `Keep below ${v}${ul}`, cold: true };
    }
    if (selectedItem.target_internal_temp_f != null) {
      const v = toDisplay(selectedItem.target_internal_temp_f, unit);
      return { text: `Pull at ${v}${ul}`, cold: false };
    }
    return null;
  }
  const hint = tempHint();

  // Alert display values (convert from stored °F)
  const minAlertDisplay = minAlertF !== "" ? (toDisplay(Number(minAlertF), unit) ?? "") : "";
  const maxAlertDisplay = maxAlertF !== "" ? (toDisplay(Number(maxAlertF), unit) ?? "") : "";

  return (
    <div className={`probe-card${hasItem ? " probe-card--active" : ""}${isColdSmoke ? " probe-card--cold" : ""}`}>
      {/* Header */}
      <div className="probe-card__header">
        <span className="probe-card__name">{probe.name}</span>
        {hasItem
          ? <span className={`probe-card__tag ${isColdSmoke ? "probe-card__tag--cold" : "probe-card__tag--assigned"}`}>
              {isColdSmoke ? "❄ " : ""}{itemType}{itemWeight ? ` · ${itemWeight} lb` : ""}
            </span>
          : <span className="probe-card__tag probe-card__tag--empty">Unassigned</span>
        }
      </div>

      {/* Temperature */}
      <div className="probe-card__temp-block">
        {tempDisplay != null
          ? <>
              <span className={`probe-card__temp${isColdSmoke ? " probe-card__temp--cold" : ""}`}>
                {tempDisplay}
              </span>
              <span className="probe-card__temp-unit">{ul}</span>
            </>
          : <span className="probe-card__temp probe-card__temp--na">—</span>
        }
      </div>

      {/* Meta row */}
      {(rateOfRiseF !== null || elapsed !== null) && (
        <div className="probe-card__meta">
          {rateLabel(rateOfRiseF) && <strong>{rateLabel(rateOfRiseF)}</strong>}
          {rateOfRiseF !== null && elapsed !== null && <span className="probe-card__meta-sep">·</span>}
          {elapsed !== null && <span>{fmtElapsed(elapsed)} elapsed</span>}
        </div>
      )}

      {/* Mini sparkline */}
      <ProbeChart probe={probe} data={data} isColdSmoke={isColdSmoke} />

      {/* AI advisor result */}
      {advice && (
        <AdvisorPanel
          advice={advice}
          cached={adviceCached}
          unit={unit}
          onApplyPitTemp={onApplyPitTemp}
          isColdSmoke={isColdSmoke}
        />
      )}

      {/* Actions */}
      <div className="probe-card__actions">
        {hasItem && !isColdSmoke && (
          <button className="probe-btn probe-btn--ai" onClick={handleAdvisor} disabled={advisorBusy}>
            {advisorBusy ? "Getting AI…" : advice ? "↻ Refresh AI" : "🤖 AI Guidance"}
          </button>
        )}
        <button className="probe-btn probe-btn--config" onClick={() => setConfigOpen((o) => !o)}>
          {configOpen ? "✕ Close" : "⚙ Configure"}
        </button>
      </div>

      {/* Collapsible config */}
      {configOpen && (
        <div className="probe-card__config">
          <div className="config-row">
            <label>Item</label>
            <select value={itemType} onChange={handleItemTypeChange} onBlur={saveItemDetails}>
              <option value="">Select item…</option>
              {itemTypes.map((it) => (
                <option key={it.name} value={it.name}>{it.name}</option>
              ))}
            </select>
          </div>

          {hint && (
            <div className={`config-hint${hint.cold ? " config-hint--cold" : ""}`}>
              {hint.cold ? "❄" : "🎯"} {hint.text}
            </div>
          )}

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
            <label>Alert {ul}</label>
            <div className="config-alert-range">
              <input
                type="number"
                inputMode="numeric"
                value={minAlertDisplay}
                onChange={(e) => {
                  const f = fromDisplay(e.target.value, unit);
                  setMinAlertF(f != null ? String(f) : "");
                }}
                placeholder="Min"
              />
              <span>–</span>
              <input
                type="number"
                inputMode="numeric"
                value={maxAlertDisplay}
                onChange={(e) => {
                  const f = fromDisplay(e.target.value, unit);
                  setMaxAlertF(f != null ? String(f) : "");
                }}
                placeholder="Max"
              />
            </div>
          </div>
          {availablePartners.length > 0 && (
            <div className="config-row">
              <label>Group</label>
              <select
                value=""
                onChange={(e) => e.target.value && onGroupWith?.(probe.id, e.target.value)}
              >
                <option value="">Link with probe…</option>
                {availablePartners.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="config-actions">
            <button className="probe-btn probe-btn--save" onClick={saveAlerts}>Save</button>
            {(minAlertF || maxAlertF) && (
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
