// src/components/LiveSensors.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchLatestSession, fetchSensors } from "../api";

const POLL_MS = 15000; // 15s UI refresh

export default function LiveSensors() {
  const [sessionId, setSessionId] = useState("");
  const [manualSessionId, setManualSessionId] = useState("");
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unit, setUnit] = useState("F"); // "F" | "C"
  const timerRef = useRef(null);
  const inFlightRef = useRef(false);

  const latest = useMemo(() => samples[0] || {}, [samples]);

  const toNA = useCallback((v) => {
    if (v === undefined || v === null) return "N/A";
    if (typeof v === "number" && v === -999) return "N/A";
    return v;
  }, []);

  const convert = useCallback(
    (v) => {
      const n = Number(v);
      if (!isFinite(n) || n === -999) return "N/A";
      if (unit === "F") return Math.round(n); // assume source is °F
      // F -> C
      return Math.round(((n - 32) * 5) / 9);
    },
    [unit]
  );

  const resolveSessionId = useCallback(async () => {
    try {
      setError("");
      if (manualSessionId.trim()) {
        return manualSessionId.trim();
      }
      const data = await fetchLatestSession();
      return String(data.session_id || "");
    } catch {
      setError("Failed to get latest session");
      return "";
    }
  }, [manualSessionId]);

  const fetchAndSet = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      setLoading(true);
      const sid = await resolveSessionId();
      if (!sid) return;
      setSessionId(sid);

      const data = await fetchSensors(sid, 100);
      // Sort newest-first by timestamp (string compare works for ISO-like; falls back if missing)
      const sorted = [...(Array.isArray(data) ? data : [])].sort((a, b) => {
        const ta = String(a?.timestamp ?? "");
        const tb = String(b?.timestamp ?? "");
        return tb.localeCompare(ta);
      });
      setSamples(sorted);
      setError("");
    } catch {
      setError("Failed to load sensor data");
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [resolveSessionId]);

  useEffect(() => {
    // kick off immediately, then poll
    fetchAndSet();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(fetchAndSet, POLL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchAndSet]); // re-arm when manualSessionId changes via resolveSessionId dependency

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <span className="font-semibold">Session:</span>
        <code className="px-2 py-1 bg-gray-100 rounded">{sessionId || "—"}</code>

        <input
          className="border rounded px-2 py-1 ml-4"
          placeholder="Override session_id (optional)"
          value={manualSessionId}
          onChange={(e) => setManualSessionId(e.target.value)}
        />
        <button
          className="border rounded px-3 py-1"
          onClick={fetchAndSet}
          title="Refresh now"
        >
          Refresh
        </button>

        <div className="ml-4 flex items-center gap-2">
          <span className="text-sm text-gray-600">Units:</span>
          <button
            className={`border rounded px-2 py-1 ${unit === "F" ? "font-semibold" : ""}`}
            onClick={() => setUnit("F")}
            aria-pressed={unit === "F"}
          >
            °F
          </button>
          <button
            className={`border rounded px-2 py-1 ${unit === "C" ? "font-semibold" : ""}`}
            onClick={() => setUnit("C")}
            aria-pressed={unit === "C"}
          >
            °C
          </button>
        </div>

        {loading && <span className="ml-3 text-sm text-gray-500">Loading…</span>}
        {error && <span className="ml-3 text-sm text-red-600">{error}</span>}
      </div>

      {/* Current (latest) readings summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <Stat label={`Top °${unit}`} value={convert(toNA(latest.top_temp))} />
        <Stat label={`Middle °${unit}`} value={convert(toNA(latest.middle_temp))} />
        <Stat label={`Bottom °${unit}`} value={convert(toNA(latest.bottom_temp))} />
        <Stat label="Smoke (ppm)" value={toNA(latest.smoke_ppm)} />
        <Stat label="Humidity (%)" value={toNA(latest.humidity)} />
        <Stat label={`Outside °${unit}`} value={convert(toNA(latest.outside_temp))} />
      </div>

      {/* Simple table of recent samples */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Timestamp</th>
              <th className="py-2 pr-4">Top</th>
              <th className="py-2 pr-4">Mid</th>
              <th className="py-2 pr-4">Bot</th>
              <th className="py-2 pr-4">Smoke</th>
              <th className="py-2 pr-4">Hum</th>
              <th className="py-2 pr-4">Probe1</th>
              <th className="py-2 pr-4">Probe2</th>
              <th className="py-2 pr-4">Probe3</th>
            </tr>
          </thead>
          <tbody>
            {samples.length === 0 ? (
              <tr>
                <td className="py-2 pr-4" colSpan={9}>
                  No samples yet.
                </td>
              </tr>
            ) : (
              samples.map((s, i) => (
                <tr key={`${s.timestamp || "t"}-${i}`} className="border-b last:border-0">
                  <td className="py-1 pr-4">{s.timestamp || "—"}</td>
                  <td className="py-1 pr-4">{convert(toNA(s.top_temp))}</td>
                  <td className="py-1 pr-4">{convert(toNA(s.middle_temp))}</td>
                  <td className="py-1 pr-4">{convert(toNA(s.bottom_temp))}</td>
                  <td className="py-1 pr-4">{toNA(s.smoke_ppm)}</td>
                  <td className="py-1 pr-4">{toNA(s.humidity)}</td>
                  <td className="py-1 pr-4">{convert(toNA(s.probe1_temp))}</td>
                  <td className="py-1 pr-4">{convert(toNA(s.probe2_temp))}</td>
                  <td className="py-1 pr-4">{convert(toNA(s.probe3_temp))}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="p-3 border rounded">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold">{value ?? "—"}</div>
    </div>
  );
}
