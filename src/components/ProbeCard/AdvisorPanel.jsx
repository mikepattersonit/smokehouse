// src/components/ProbeCard/AdvisorPanel.jsx
import React from "react";
import { toDisplay, unitLabel } from "../../utils/temperature";

export default function AdvisorPanel({ advice, cached, unit = "F", onApplyPitTemp }) {
  if (!advice) return null;

  const {
    eta_hours,
    doneness_percent,
    stall_detected,
    target_internal_temp_f,
    recommended_pit_temp_f,
    rest_time_minutes,
    notes,
  } = advice;

  const ul = unitLabel(unit);

  const stats = [
    doneness_percent != null && { label: "Doneness", value: `${Math.round(doneness_percent)}%` },
    eta_hours        != null && { label: "ETA",      value: eta_hours === 0 ? "Done" : `~${eta_hours.toFixed(1)} hr` },
    target_internal_temp_f != null && { label: "Target", value: `${toDisplay(target_internal_temp_f, unit)}${ul}` },
    rest_time_minutes      != null && { label: "Rest",   value: `${rest_time_minutes} min` },
  ].filter(Boolean);

  return (
    <div className="probe-card__advisor">
      <div className="advisor__header">
        🤖 AI Guidance
        {cached && <span className="advisor__cached">cached</span>}
      </div>

      {stats.length > 0 && (
        <div className="advisor__grid">
          {stats.map(({ label, value }) => (
            <div key={label} className="advisor__stat">
              <div className="advisor__stat-label">{label}</div>
              <div className="advisor__stat-value">{value}</div>
            </div>
          ))}
        </div>
      )}

      {stall_detected && (
        <div className="advisor__stall">⚠ Stall detected — temperature plateau in progress</div>
      )}

      {recommended_pit_temp_f != null && (
        <div className="advisor__pit-row">
          <span>Recommended pit: <strong>{toDisplay(recommended_pit_temp_f, unit)}{ul}</strong></span>
          {onApplyPitTemp && (
            <button className="advisor__apply-btn" onClick={() => onApplyPitTemp(recommended_pit_temp_f)}>
              Apply
            </button>
          )}
        </div>
      )}

      {notes && <p className="advisor__notes">{notes}</p>}
    </div>
  );
}
