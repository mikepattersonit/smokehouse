// src/components/ProbeCard/ProbeChart.js
import React, { useMemo } from "react";
import { Line } from "react-chartjs-2";
import "chart.js/auto";

function sanitize(v) {
  if (v == null || v === -999 || v === "-999") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function ProbeChart({ probe, data = [], isColdSmoke = false }) {
  const { labels, values } = useMemo(() => {
    // data is newest-first — reverse so time runs left→right
    const rows = [...data].reverse();
    return {
      labels: rows.map((_, i) => i),
      values: rows.map((r) => sanitize(r?.[probe?.id])),
    };
  }, [data, probe?.id]);

  const hasData = values.some((v) => v != null);
  if (!hasData) return <div className="probe-card__chart" />;

  const chartData = {
    labels,
    datasets: [{
      data: values,
      borderColor: isColdSmoke ? "#60a5fa" : "#f97316",
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.3,
      fill: true,
      backgroundColor: (ctx) => {
        const chart = ctx.chart;
        const { ctx: c, chartArea } = chart;
        if (!chartArea) return "transparent";
        const grad = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        if (isColdSmoke) {
          grad.addColorStop(0, "rgba(96,165,250,0.25)");
          grad.addColorStop(1, "rgba(96,165,250,0)");
        } else {
          grad.addColorStop(0, "rgba(249,115,22,0.25)");
          grad.addColorStop(1, "rgba(249,115,22,0)");
        }
        return grad;
      },
    }],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
    },
    scales: {
      x: { display: false },
      y: { display: false, beginAtZero: false },
    },
    elements: { line: { spanGaps: true } },
  };

  return (
    <div className="probe-card__chart">
      <Line data={chartData} options={options} />
    </div>
  );
}
