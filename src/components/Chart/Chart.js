// src/components/Chart/Chart.js
import React, { useMemo } from "react";
import { Line } from "react-chartjs-2";
import "chart.js/auto";

/**
 * Robust timestamp parser:
 * - "YYYYMMDDTHHMMSSZ" -> Date
 * - "HHMMSS" -> Date on the same day as `sessionId` (YYYYMMDDHHMMSS)
 * - Anything else -> string fallback (label)
 */
function parseTimestamp(ts, sessionId) {
  if (!ts) return null;

  // full ISO-like "YYYYMMDDTHHMMSSZ"
  if (typeof ts === "string" && ts.length >= 17 && ts.includes("T") && ts.endsWith("Z")) {
    const iso = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}Z`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // "HHMMSS" + derive date from sessionId (YYYYMMDDHHMMSS)
  if (typeof ts === "string" && ts.length === 6 && /^\d{6}$/.test(ts) && sessionId && /^\d{14}$/.test(sessionId)) {
    const y = sessionId.slice(0, 4);
    const m = sessionId.slice(4, 6);
    const d = sessionId.slice(6, 8);
    const hh = ts.slice(0, 2);
    const mm = ts.slice(2, 4);
    const ss = ts.slice(4, 6);
    const iso = `${y}-${m}-${d}T${hh}:${mm}:${ss}Z`;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // Already a Date?
  if (ts instanceof Date) return ts;

  // Fallback: try vanilla Date constructor
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtLabel(d) {
  try {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return String(d ?? "");
  }
}

const COLOR = {
  internal_temp: "#9CA3AF", // Outside
  top_temp: "#60A5FA",
  middle_temp: "#34D399",
  bottom_temp: "#F59E0B",
  humidity: "#A78BFA",
  smoke_ppm: "#EF4444",
  probe1_temp: "#10B981",
  probe2_temp: "#3B82F6",
  probe3_temp: "#F97316",
};

const FRIENDLY = (key) =>
  key === "internal_temp"
    ? "OUTSIDE TEMP"
    : key.replace(/_/g, " ").toUpperCase();

function sanitize(v) {
  if (v === -999 || v === undefined || v === null) return null; // Chart.js gap
  return typeof v === "number" ? v : Number.isFinite(Number(v)) ? Number(v) : null;
}

export default function Chart({ data = [], sessionId }) {
  // Normalize, sort by time, build aligned labels & datasets
  const { labels, datasets } = useMemo(() => {
    // 1) normalize rows with parsed Date (or null)
    const rows = data.map((row, idx) => {
      const dt = parseTimestamp(row.timestamp, sessionId);
      return { ...row, __t: dt, __idx: idx };
    });

    // 2) sort by time then by original index (stable)
    rows.sort((a, b) => {
      const ta = a.__t ? a.__t.getTime() : 0;
      const tb = b.__t ? b.__t.getTime() : 0;
      if (ta !== tb) return ta - tb;
      return a.__idx - b.__idx;
    });

    // 3) labels (time strings or fallback index)
    const labels = rows.map((r, i) => (r.__t ? fmtLabel(r.__t) : String(i + 1)));

    // 4) sensors we show by default (can extend later)
    const wanted = [
      "internal_temp",
      "top_temp",
      "middle_temp",
      "bottom_temp",
      "humidity",
      "smoke_ppm",
    ];

    const datasets = wanted.map((key) => ({
      label: FRIENDLY(key),
      data: rows.map((r) => sanitize(r[key])), // keep same length; null creates gaps
      borderColor: COLOR[key] || "#999",
      pointRadius: 0,
      spanGaps: true,
      tension: 0.25,
    }));

    return { labels, datasets };
  }, [data, sessionId]);

  const chartData = { labels, datasets };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: {
        position: "right",
        labels: { color: "#fff" },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${ctx.raw ?? "—"}`,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: "#fff" },
        grid: { color: "#444" },
      },
      y: {
        ticks: { color: "#fff" },
        grid: { color: "#444" },
        beginAtZero: false,
      },
    },
  };

  return (
    <div style={{ width: "100%", height: 240 }}>
      <Line data={chartData} options={chartOptions} />
    </div>
  );
}
