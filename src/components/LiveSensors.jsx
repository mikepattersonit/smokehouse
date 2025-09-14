import React, { useEffect, useMemo, useRef, useState } from "react";
import { getLatestSession, getSensors } from "../api";

const POLL_MS = 15000; // 15s UI refresh

export default function LiveSensors() {
  const [sessionId, setSessionId] = useState("");
  const [manualSessionId, setManualSessionId] = useState("");
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const timerRef = useRef(null);

  const latest = useMemo(() => samples[0] || {}, [samples]);

  function toNA(v) {
    if (v === undefined || v === null) return "N/A";
    if (typeof v === "number" && v === -999) return "N/A";
    return v;
  }

  async function resolveSessionId() {
    try {
      setError("");
      if (manualSessionId.trim()) {
        return manualSessionId.trim();
      }
      const data = await getLatestSession();
      return String(data.session_id);
    } catch (e) {
      setError("Failed to get latest session");
      return "";
    }
  }

  async function fetchAndSet() {
    try {
      setLoading(true);
      const sid = await resolveSessionId();
      if (!sid) return;
      setSessionId(sid);
      const data = await getSensors(sid, 100);
      // newest first is nice for UI
      setSamples(data);
    } catch (e) {
      setError("Failed to load sensor data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAndSet(); // initial
    timerRef.current = setInterval(fetchAndSet, POLL_MS);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualSessionId]);

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <span className="font-semibold">Session:</span>
        <code className="px-2 py-1 bg-gray-100 rounded">
          {sessionId || "—"}
        </code>

        <input
          className="border rounded px-2 py-1 ml-4"
          placeholder="Override session_id (optional)"
          value={manualSessionId}
          onChange={(e) => setManualSessionId(e.target.value)}
        />
        <button
          className="border rounded px-3 py-1"
          onClick={() => fetchAndSet()}
          title="Refresh now"
        >
          Refresh
        </button>

        {loading && <span className="ml-3 text-sm text-gray-500">Loading…</span>}
        {error && <span className="ml-3 text-sm text-red-600">{error}</span>}
      </div>

      {/* Current (latest) readings summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <Stat label="Top °F" value={toNA(latest.top_temp)} />
        <Stat label="Middle °F" value={toNA(latest.middle_temp)} />
        <Stat label="Bottom °F" value={toNA(latest.bottom_temp)} />
        <Stat label="Smoke (ppm)" value={toNA(latest.smoke_ppm)} />
        <Stat label="Humidity (%)" value={toNA(latest.humidity)} />
        <Stat label="Outside °F" value={toNA(latest.outside_temp)} />
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
            {samples.map((s, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-1 pr-4">{s.timestamp || "—"}</td>
                <td className="py-1 pr-4">{toNA(s.top_temp)}</td>
                <td className="py-1 pr-4">{toNA(s.middle_temp)}</td>
                <td className="py-1 pr-4">{toNA(s.bottom_temp)}</td>
                <td className="py-1 pr-4">{toNA(s.smoke_ppm)}</td>
                <td className="py-1 pr-4">{toNA(s.humidity)}</td>
                <td className="py-1 pr-4">{toNA(s.probe1_temp)}</td>
                <td className="py-1 pr-4">{toNA(s.probe2_temp)}</td>
                <td className="py-1 pr-4">{toNA(s.probe3_temp)}</td>
              </tr>
            ))}
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
