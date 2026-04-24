// src/components/Chart/Chart.js
import React, { useMemo } from "react";
import { Line } from "react-chartjs-2";
import "chart.js/auto";
import { toDisplay, unitLabel } from "../../utils/temperature";

function parseTimestamp(ts, sessionId) {
  if (!ts) return null;

  // "YYYYMMDDTHHMMSSZ"
  if (typeof ts === "string" && ts.length >= 17 && ts.includes("T") && ts.endsWith("Z")) {
    const iso = `${ts.slice(0,4)}-${ts.slice(4,6)}-${ts.slice(6,8)}T${ts.slice(9,11)}:${ts.slice(11,13)}:${ts.slice(13,15)}Z`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // "HHMMSS" + date derived from sessionId (YYYYMMDDHHMMSS)
  if (typeof ts === "string" && /^\d{6}$/.test(ts) && sessionId && /^\d{14}$/.test(String(sessionId))) {
    const s = String(sessionId);
    const iso = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${ts.slice(0,2)}:${ts.slice(2,4)}:${ts.slice(4,6)}Z`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (ts instanceof Date) return ts;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtLabel(d) {
  try {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return String(d ?? "");
  }
}

function sanitize(v) {
  if (v === -999 || v === undefined || v === null) return null;
  return typeof v === "number" ? v : Number.isFinite(Number(v)) ? Number(v) : null;
}

export default function Chart({ data = [], sessionId, unit = "F" }) {
  const { labels, datasets } = useMemo(() => {
    const rows = data.map((row, idx) => ({
      ...row,
      __t: parseTimestamp(row.timestamp, sessionId),
      __idx: idx,
    }));

    // Sort oldest→newest so time runs left→right
    rows.sort((a, b) => {
      const ta = a.__t ? a.__t.getTime() : 0;
      const tb = b.__t ? b.__t.getTime() : 0;
      return ta !== tb ? ta - tb : a.__idx - b.__idx;
    });

    const labels = rows.map((r, i) => (r.__t ? fmtLabel(r.__t) : String(i + 1)));

    const series = [
      { key: "top_temp",      label: "Top",     color: "#60a5fa" },
      { key: "middle_temp",   label: "Middle",  color: "#34d399" },
      { key: "bottom_temp",   label: "Bottom",  color: "#f59e0b" },
      { key: "internal_temp", label: "Outside", color: "#9ca3af" },
    ];

    const datasets = series.map(({ key, label, color }) => ({
      label,
      data: rows.map((r) => {
        const v = sanitize(r[key]);
        return v != null ? toDisplay(v, unit) : null;
      }),
      borderColor: color,
      borderWidth: 1.5,
      pointRadius: 0,
      spanGaps: true,
      tension: 0.25,
    }));

    return { labels, datasets };
  }, [data, sessionId, unit]);

  const ul = unitLabel(unit);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${ctx.raw ?? "—"}${ul}`,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: "#555",
          maxTicksLimit: 8,
          maxRotation: 0,
          font: { family: "'JetBrains Mono', monospace", size: 10 },
        },
        grid: { color: "#1e1e1e" },
      },
      y: {
        ticks: {
          color: "#555",
          font: { family: "'JetBrains Mono', monospace", size: 10 },
        },
        grid: { color: "#1e1e1e" },
        beginAtZero: false,
      },
    },
  };

  return (
    <div style={{ width: "100%", height: 200 }}>
      <Line data={{ labels, datasets }} options={options} />
    </div>
  );
}
