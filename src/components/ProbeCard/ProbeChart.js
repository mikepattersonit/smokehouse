// src/components/ProbeCard/ProbeChart.js
import React, { useMemo } from "react";
import { Line } from "react-chartjs-2";
import "chart.js/auto";

const PALETTE = [
  "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728",
  "#9467bd", "#8c564b", "#e377c2", "#7f7f7f",
  "#bcbd22", "#17becf",
];

function pickColor(key = "") {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function fmtTime(ts) {
  if (ts == null) return "—";
  const s = String(ts);

  // If it's ISO-like, let Date format it
  const d = Date.parse(s);
  if (!Number.isNaN(d)) return new Date(d).toLocaleTimeString();

  // If it's HHMMSS (e.g., "204522"), pretty print
  if (/^\d{6}$/.test(s)) return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`;

  return s; // Fallback to raw
}

function sanitize(v) {
  if (v === -999 || v === "-999") return null; // gaps in chart
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function ProbeChart({ probe, data = [] }) {
  const { labels, series } = useMemo(() => {
    const lbls = data.map((row) => fmtTime(row?.timestamp));
    const vals = data.map((row) => sanitize(row?.[probe?.id]));
    return { labels: lbls, series: vals };
  }, [data, probe?.id]);

  const color = useMemo(() => pickColor(probe?.id || probe?.name || "probe"), [probe?.id, probe?.name]);

  const chartData = useMemo(
    () => ({
      labels,
      datasets: [
        {
          label: `${probe?.name || "Probe"} Temperature (°F)`,
          data: series,
          fill: false,
          borderColor: color,
          pointRadius: 0,
          tension: 0.35,
        },
      ],
    }),
    [labels, series, color, probe?.name]
  );

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top",
          labels: { color: "#fff" },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.raw ?? "—"}°F`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#fff", maxRotation: 0 },
          grid: { color: "#444" },
        },
        y: {
          ticks: { color: "#fff" },
          grid: { color: "#444" },
        },
      },
      elements: {
        line: { spanGaps: true }, // connect over small gaps; nulls create breaks
      },
    }),
    []
  );

  const hasAnyPoint = series.some((v) => v != null);

  return (
    <div style={{ width: "75%", height: 200, marginBottom: 20 }}>
      <h3 style={{ color: "#fff", textAlign: "left", marginTop: 0 }}>
        {(probe?.name || "Probe") + " Temperature Trends"}
      </h3>
      <div style={{ width: "100%", height: "100%" }}>
        {hasAnyPoint ? (
          <Line data={chartData} options={chartOptions} />
        ) : (
          <div style={{ color: "#aaa", padding: "8px 0" }}>No probe data yet.</div>
        )}
      </div>
    </div>
  );
}
