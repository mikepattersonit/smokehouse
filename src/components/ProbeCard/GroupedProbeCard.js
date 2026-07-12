// src/components/ProbeCard/GroupedProbeCard.js
import React, { useEffect, useState, useCallback, useMemo } from "react";
import "./ProbeCard.css";
import { postAdvisor } from "../../api";
import AdvisorPanel from "./AdvisorPanel";
import ProbeChart from "./ProbeChart";
import { toDisplay, fromDisplay, unitLabel } from "../../utils/temperature";

function parseCompactUtc(ts) {
  const s = String(ts || "").trim();
  if (s.length < 16 || !s.includes("T") || !s.endsWith("Z")) return null;
  const iso = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(9,11)}:${s.slice(11,13)}:${s.slice(13,15)}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function minutesSince(insertedAt, latestTimestamp) {
  const start = parseCompactUtc(insertedAt);
  const end = parseCompactUtc(latestTimestamp);
  if (!start || !end) return null;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000));
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
  const delta = vals[0] - vals[vals.length - 1];
  return Math.round((delta / (vals.length - 1)) * 60 * 10) / 10;
}

function GroupedProbeCard({
  probes,
  data = [],
  sessionId,
  itemTypes = [],
  unit = "F",
  onSetAlert,
  onClearAlert,
  onItemChange,
  onUngroup,
  onApplyPitTemp,
  onMarkInserted,
  onAdviceUpdate,
}) {
  const [p1, p2] = probes;
  const ul = unitLabel(unit);

  const [itemType,   setItemType]   = useState(p1.itemType   ?? "");
  const [itemWeight, setItemWeight] = useState(p1.itemWeight ?? "");
  const [min1F, setMin1F] = useState(p1.minAlert ?? "");
  const [max1F, setMax1F] = useState(p1.maxAlert ?? "");
  const [min2F, setMin2F] = useState(p2.minAlert ?? "");
  const [max2F, setMax2F] = useState(p2.maxAlert ?? "");
  const [configOpen,   setConfigOpen]   = useState(false);
  const [advisorBusy,  setAdvisorBusy]  = useState(false);
  const [adviceError,  setAdviceError]  = useState(null);

  // Re-sync local edit state whenever the underlying assignment actually
  // changes, not just on mount — see ProbeCard.js for why depending only on
  // the probe ids missed data that arrived after the initial render.
  useEffect(() => {
    setItemType(p1.itemType   ?? "");
    setItemWeight(p1.itemWeight ?? "");
    setMin1F(p1.minAlert ?? "");
    setMax1F(p1.maxAlert ?? "");
    setMin2F(p2.minAlert ?? "");
    setMax2F(p2.maxAlert ?? "");
  }, [p1.id, p2.id, p1.itemType, p1.itemWeight, p1.minAlert, p1.maxAlert, p2.minAlert, p2.maxAlert]);

  const selectedItem = useMemo(
    () => itemTypes.find((it) => it.name === itemType) || null,
    [itemTypes, itemType]
  );
  const isColdSmoke = selectedItem?.smoke_type === "cold";

  const handleItemTypeChange = useCallback((e) => {
    const name = e.target.value;
    setItemType(name);
    const item = itemTypes.find((it) => it.name === name);
    if (!item) return;
    if (item.smoke_type === "cold" && item.max_safe_temp_f != null) {
      setMax1F(String(item.max_safe_temp_f));
      setMin1F("");
      setMax2F(String(item.max_safe_temp_f));
      setMin2F("");
    } else if (item.target_internal_temp_f != null) {
      setMax1F(String(item.target_internal_temp_f));
      setMin1F("");
      setMax2F(String(item.target_internal_temp_f));
      setMin2F("");
    }
  }, [itemTypes]);

  const saveItemDetails = useCallback(() => {
    onItemChange?.(p1.id, itemType, itemWeight);
  }, [onItemChange, p1.id, itemType, itemWeight]);

  const saveAlerts = useCallback(() => {
    onSetAlert?.(p1.id, min1F, max1F);
    onSetAlert?.(p2.id, min2F, max2F);
    setConfigOpen(false);
  }, [onSetAlert, p1.id, p2.id, min1F, max1F, min2F, max2F]);

  const clearAlerts = useCallback(() => {
    setMin1F(""); setMax1F("");
    setMin2F(""); setMax2F("");
    onClearAlert?.(p1.id);
    onClearAlert?.(p2.id);
  }, [onClearAlert, p1.id, p2.id]);

  // Use the lower-temp probe for AI (the undercooked end matters most)
  const advisorProbe = (p1.temperature ?? Infinity) <= (p2.temperature ?? Infinity) ? p1 : p2;
  const advice = advisorProbe.aiAdvice ?? null;
  const adviceCached = advisorProbe.aiAdviceCached ?? false;

  const handleAdvisor = useCallback(async () => {
    if (!sessionId) return;
    setAdvisorBusy(true);
    setAdviceError(null);
    try {
      const res = await postAdvisor({ session_id: sessionId, probe_id: advisorProbe.id });
      if (!res || res.error) throw new Error(res?.error || "Advisor error");
      onAdviceUpdate?.(advisorProbe.id, res.advice, res.cached ?? false);
    } catch (err) {
      console.error("Advisor error:", err); // eslint-disable-line no-console
      setAdviceError("Unable to get AI guidance right now. Please try again.");
    } finally {
      setAdvisorBusy(false);
    }
  }, [sessionId, advisorProbe.id, onAdviceUpdate]);

  const ror1 = useMemo(() => computeRateOfRise(data, p1.id), [data, p1.id]);
  const ror2 = useMemo(() => computeRateOfRise(data, p2.id), [data, p2.id]);

  function rateLabel(rorF) {
    if (rorF === null) return null;
    const v = unit === "C" ? Math.round(rorF * 5 / 9 * 10) / 10 : rorF;
    return `${v >= 0 ? "+" : ""}${v}${ul}/hr`;
  }

  function tempHint() {
    if (!selectedItem) return null;
    if (isColdSmoke && selectedItem.max_safe_temp_f != null) {
      return { text: `Keep below ${toDisplay(selectedItem.max_safe_temp_f, unit)}${ul}`, cold: true };
    }
    if (selectedItem.target_internal_temp_f != null) {
      return { text: `Pull at ${toDisplay(selectedItem.target_internal_temp_f, unit)}${ul}`, cold: false };
    }
    return null;
  }
  const hint = tempHint();
  const hasItem = Boolean(itemType);
  const hasAlerts = min1F || max1F || min2F || max2F;

  const insertedElapsed = useMemo(() => {
    if (!p1.insertedAt) return null;
    const latestRow = data[0];
    if (!latestRow) return null;
    return minutesSince(p1.insertedAt, latestRow.timestamp);
  }, [p1.insertedAt, data]);

  const handleMarkInserted = useCallback(() => {
    onMarkInserted?.(p1.id);
    onMarkInserted?.(p2.id);
  }, [onMarkInserted, p1.id, p2.id]);

  return (
    <div className={`probe-card probe-card--grouped${hasItem ? " probe-card--active" : ""}${isColdSmoke ? " probe-card--cold" : ""}`}>

      {/* Header */}
      <div className="probe-card__header">
        <div className="probe-card__group-meta">
          <span className="probe-card__name">Multi-probe</span>
          {hasItem && (
            <span className={`probe-card__tag ${isColdSmoke ? "probe-card__tag--cold" : "probe-card__tag--assigned"}`}>
              {isColdSmoke ? "❄ " : ""}{itemType}{itemWeight ? ` · ${itemWeight} lb` : ""}
            </span>
          )}
          {insertedElapsed !== null && (
            <span className="probe-card__meta">🔪 inserted {fmtElapsed(insertedElapsed)} ago</span>
          )}
        </div>
        <button
          className="probe-btn probe-btn--ungroup"
          onClick={() => onUngroup?.(p1.groupId)}
        >
          Ungroup
        </button>
      </div>

      {/* Dual temperature columns */}
      <div className="probe-card__dual-temps">
        {[{ probe: p1, ror: ror1 }, { probe: p2, ror: ror2 }].map(({ probe, ror }) => {
          const td = probe.temperature != null ? toDisplay(probe.temperature, unit) : null;
          return (
            <div key={probe.id} className="probe-card__dual-temp-cell">
              <div className="probe-card__dual-label">{probe.name}</div>
              <div className="probe-card__temp-block" style={{ padding: "2px 0 4px" }}>
                {td != null
                  ? <>
                      <span className={`probe-card__temp probe-card__temp--sm${isColdSmoke ? " probe-card__temp--cold" : ""}`}>
                        {td}
                      </span>
                      <span className="probe-card__temp-unit">{ul}</span>
                    </>
                  : <span className="probe-card__temp probe-card__temp--na probe-card__temp--sm">—</span>
                }
              </div>
              {rateLabel(ror) && (
                <div className="probe-card__meta" style={{ padding: 0, fontSize: "0.72rem" }}>
                  <strong>{rateLabel(ror)}</strong>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Dual sparklines */}
      <div className="probe-card__dual-charts">
        <ProbeChart probe={p1} data={data} isColdSmoke={isColdSmoke} />
        <ProbeChart probe={p2} data={data} isColdSmoke={isColdSmoke} />
      </div>

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
      {adviceError && <div className="probe-card__advisor-error">{adviceError}</div>}

      {/* Actions */}
      <div className="probe-card__actions">
        {hasItem && !isColdSmoke && (
          <button className="probe-btn probe-btn--ai" onClick={handleAdvisor} disabled={advisorBusy}>
            {advisorBusy ? "Getting AI…" : advice ? "↻ Refresh AI" : "🤖 AI Guidance"}
          </button>
        )}
        {hasItem && (
          <button className="probe-btn probe-btn--insert" onClick={handleMarkInserted}>
            📍 {p1.insertedAt ? "Re-mark Inserted" : "Mark Inserted"}
          </button>
        )}
        <button className="probe-btn probe-btn--config" onClick={() => setConfigOpen((o) => !o)}>
          {configOpen ? "✕ Close" : "⚙ Configure"}
        </button>
      </div>

      {/* Config panel */}
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

          <div className="config-section-label">{p1.name} alerts {ul}</div>
          <div className="config-row">
            <label>Alert</label>
            <div className="config-alert-range">
              <input
                type="number" inputMode="numeric"
                value={min1F !== "" ? (toDisplay(Number(min1F), unit) ?? "") : ""}
                onChange={(e) => { const f = fromDisplay(e.target.value, unit); setMin1F(f != null ? String(f) : ""); }}
                placeholder="Min"
              />
              <span>–</span>
              <input
                type="number" inputMode="numeric"
                value={max1F !== "" ? (toDisplay(Number(max1F), unit) ?? "") : ""}
                onChange={(e) => { const f = fromDisplay(e.target.value, unit); setMax1F(f != null ? String(f) : ""); }}
                placeholder="Max"
              />
            </div>
          </div>

          <div className="config-section-label">{p2.name} alerts {ul}</div>
          <div className="config-row">
            <label>Alert</label>
            <div className="config-alert-range">
              <input
                type="number" inputMode="numeric"
                value={min2F !== "" ? (toDisplay(Number(min2F), unit) ?? "") : ""}
                onChange={(e) => { const f = fromDisplay(e.target.value, unit); setMin2F(f != null ? String(f) : ""); }}
                placeholder="Min"
              />
              <span>–</span>
              <input
                type="number" inputMode="numeric"
                value={max2F !== "" ? (toDisplay(Number(max2F), unit) ?? "") : ""}
                onChange={(e) => { const f = fromDisplay(e.target.value, unit); setMax2F(f != null ? String(f) : ""); }}
                placeholder="Max"
              />
            </div>
          </div>

          <div className="config-actions">
            <button className="probe-btn probe-btn--save" onClick={saveAlerts}>Save</button>
            {hasAlerts && (
              <button className="probe-btn probe-btn--clear" onClick={clearAlerts}>Clear alerts</button>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasItem && !configOpen && (
        <div className="probe-card__empty">
          <div className="probe-card__empty-text">Configure item to enable AI guidance and alerts.</div>
          <button className="probe-btn probe-btn--assign" onClick={() => setConfigOpen(true)}>
            + Configure
          </button>
        </div>
      )}
    </div>
  );
}

export default GroupedProbeCard;
