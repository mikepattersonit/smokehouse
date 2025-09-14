// src/components/Chart/Chart.jsx
import React, { useMemo, useState } from "react";
import { Line } from "react-chartjs-2";
import "chart.js/auto";

// Sensors available to chart
const SENSOR_FIELDS = [
  "outside_temp",
  "top_temp",
  "middle_temp",
  "bottom_temp",
  "humidity",
  "smoke_ppm",
  "probe1_temp",
  "probe2_temp",
  "probe3_temp",
];

// Default to the 5 environment signals
const DEFAULT_SELECTED = ["top_temp", "middle_temp", "bottom_temp", "humidity", "smoke_ppm"];

// Fixed palette (deterministic per sensor key)
const PALETTE = [
  "#4F46E5", // indigo
  "#10B981", // emerald
  "#F59E0B", // amber
  "#EF4444", // red
  "#06B6D4", // cyan
  "#8B5CF6", // violet
  "#22C55E", // green
  "#E11D48", // rose
  "#A855F7", // purple
];

function colorFor(key) {
  // stable mapping based on key hash
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function labelFor(sensor) {
  if (sensor === "outside_temp") return "OUTSIDE TEMP";
  return sensor.replace(/_/g, " ").toUpperCase();
}

function normalizeValue(v) {
  // Hide sentinel values as gaps
  if (v === undefined || v === null) return null;
  if (typeof v === "number" && v === -999) return null;
  return typeof v === "string" && v.trim() === "" ? null : v;
}

function toTimeLabel(ts) {
  if (ts == null) return "—";

  // Already a Date?
  if (ts instanceof Date && !isNaN(ts)) return ts.toLocaleTimeString();

  const s = String(ts);

  // Epoch ms
  if (/^\d{13}$/.test(s)) {
    const d = new Date(Number(s));
    return isNaN(d) ? s : d.toLocaleTimeString();
  }
  // Epoch seconds
  if (/^\d{10}$/.test(s)) {
    const d = new Date(Number(s) * 1000);
    return isNaN(d) ? s : d.toLocaleTimeString();
  }
  // ISO-ish (2025-09-14T18:03:00Z or 20250914T180300Z)
  if (s.includes("T") || s.includes("-")) {
    const d = new Date(s);
    return isNaN(d) ? s : d.toLocaleTimeString();
  }
  // HHMMSS (e.g., "204522")
  if (/^\d{6}$/.test(s)) {
    return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`;
  }

  // Fallback: show raw
  return s;
}

export default function Chart({ data }) {
  const [selectedSensors, setSelectedSensors] = useState(DEFAULT_SELECTED);

  const labels = useMemo(() => (Array.isArray(data) ? data.map((row) => toTimeLabel(row?.timestamp)) : []), [data]);

  const datasets = useMemo(() => {
    const rows = Array.isArray(data) ? data : [];
    return selectedSensors.map((sensor) => {
      const c = colorFor(sensor);
      return {
        label: labelFor(sensor),
        data: rows.map((row) => normalizeValue(row?.[sensor])),
        spanGaps: true, // draw over nulls as gaps
        pointRadius: 0,
        borderColor: c,
        backgroundColor: c + "33", // slight fill if ever enabled
        tension: 0.3,
      };
    });
  }, [data, selectedSensors]);

  const chartData = useMemo(
    () => ({
      labels,
      datasets,
    }),
    [labels, datasets]
  );

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "left",
          labels: {
            // neutral text so it works on light/dark themes
            color: "#444",
            boxWidth: 16,
          },
        },
        tooltip: {
          intersect: false,
          mode: "index",
          callbacks: {
            label: (ctx) => {
              const v = ctx.raw;
              const unit = ctx.dataset.label.includes("HUMIDITY")
                ? "%"
                : ctx.dataset.label.includes("SMOKE")
                ? " ppm"
                : ctx.dataset.label.includes("TEMP")
                ? " °F"
                : "";
              return `${ctx.dataset.label}: ${v ?? "N/A"}${v != null ? unit : ""}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#666" },
          grid: { color: "#e5e7eb" }, // light gray
        },
        y: {
          ticks: { color: "#666" },
          grid: { color: "#f1f5f9" }, // lighter gray
        },
      },
    }),
    []
  );

  const handleSensorSelection = (event) => {
    const values = Array.from(event.target.selectedOptions).map((o) => o.value);
    setSelectedSensors(values);
  };

  return (
    <div style={{ width: "100%", height: 280, marginBottom: 20 }}>
      {/* Sensor selector */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ color: "#111", fontSize: 14, fontWeight: 600 }}>Select sensors:</span>
        <select
          multiple
          size={Math.min(8, SENSOR_FIELDS.length)}
          value={selectedSensors}
          onChange={handleSensorSelection}
          style={{
            width: 320,
            height: "auto",
            backgroundColor: "#fff",
            color: "#111",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            padding: 6,
          }}
        >
          {SENSOR_FIELDS.map((sensor) => (
            <option key={sensor} value={sensor}>
              {labelFor(sensor)}
            </option>
          ))}
        </select>
      </div>

      {/* Line chart */}
      <div style={{ width: "100%", height: "100%" }}>
        <Line data={chartData} options={chartOptions} />
      </div>
    </div>
  );
}
