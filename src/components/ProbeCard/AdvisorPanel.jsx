import React from "react";

/**
 * Displays the structured AI advisor response inline on a ProbeCard.
 *
 * Props:
 *   advice           {object}  the advice object from the API
 *   cached           {bool}    whether this is a cached response
 *   onApplyPitTemp   {func}    called with recommended_pit_temp_f when user clicks Apply
 */
export default function AdvisorPanel({ advice, cached, onApplyPitTemp }) {
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

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        AI Guidance
        {cached && <span style={styles.cachedBadge}>cached</span>}
      </div>

      <div style={styles.grid}>
        {doneness_percent != null && (
          <Stat label="Doneness" value={`${Math.round(doneness_percent)}%`} />
        )}
        {eta_hours != null && (
          <Stat label="ETA" value={eta_hours === 0 ? "Done" : `~${eta_hours.toFixed(1)} hr`} />
        )}
        {target_internal_temp_f != null && (
          <Stat label="Target temp" value={`${target_internal_temp_f}°F`} />
        )}
        {rest_time_minutes != null && (
          <Stat label="Rest" value={`${rest_time_minutes} min`} />
        )}
      </div>

      {stall_detected && (
        <div style={styles.stallAlert}>⚠ Stall detected — temperature plateau in progress</div>
      )}

      {recommended_pit_temp_f != null && (
        <div style={styles.pitRow}>
          <span>Recommended pit temp: <strong>{recommended_pit_temp_f}°F</strong></span>
          {onApplyPitTemp && (
            <button
              style={styles.applyBtn}
              onClick={() => onApplyPitTemp(recommended_pit_temp_f)}
            >
              Apply
            </button>
          )}
        </div>
      )}

      {notes && <p style={styles.notes}>{notes}</p>}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statLabel}>{label}</div>
      <div style={styles.statValue}>{value}</div>
    </div>
  );
}

const styles = {
  panel: {
    marginTop: 12,
    padding: "10px 14px",
    background: "#1a2a1a",
    border: "1px solid #2d4a2d",
    borderRadius: 8,
    fontSize: "0.85rem",
    color: "#ccc",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontWeight: 600,
    color: "#4caf50",
    marginBottom: 8,
    fontSize: "0.9rem",
  },
  cachedBadge: {
    fontSize: "0.7rem",
    padding: "1px 6px",
    borderRadius: 4,
    background: "#333",
    color: "#888",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "6px 12px",
    marginBottom: 8,
  },
  stat: {
    background: "#222",
    borderRadius: 6,
    padding: "4px 8px",
  },
  statLabel: {
    fontSize: "0.7rem",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  statValue: {
    fontWeight: 600,
    color: "#e0e0e0",
    fontSize: "0.9rem",
  },
  stallAlert: {
    background: "#3a2a00",
    border: "1px solid #7a5a00",
    borderRadius: 6,
    padding: "4px 10px",
    color: "#ffc107",
    marginBottom: 8,
    fontSize: "0.8rem",
  },
  pitRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "6px 0",
    borderTop: "1px solid #2d4a2d",
    marginTop: 4,
    color: "#e0e0e0",
  },
  applyBtn: {
    padding: "3px 10px",
    borderRadius: 6,
    border: "1px solid #4caf50",
    background: "transparent",
    color: "#4caf50",
    cursor: "pointer",
    fontSize: "0.8rem",
    whiteSpace: "nowrap",
  },
  notes: {
    margin: "8px 0 0",
    lineHeight: 1.5,
    color: "#aaa",
    borderTop: "1px solid #2d4a2d",
    paddingTop: 8,
  },
};
