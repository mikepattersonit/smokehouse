// src/App.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import Chart from "./components/Chart/Chart";
import Alerts from "./components/Alerts/Alerts";
import ProbeCard from "./components/ProbeCard/ProbeCard";
import ProbeChart from "./components/ProbeCard/ProbeChart";
import { fetchLatestSession, fetchSensors, fetchItemTypes } from "./api";
import axios from "axios";

const POLL_MS = 15000; // 15s
const probeAssignmentEndpoint =
  "https://hgrhqnwar6.execute-api.us-east-2.amazonaws.com/ManageProbeAssignments";

export default function App() {
  // Data
  const [sessionId, setSessionId] = useState("");
  const [sensorData, setSensorData] = useState([]);
  const [itemTypes, setItemTypes] = useState([]); // formerly "meat types"
  const [alerts, setAlerts] = useState([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const timerRef = useRef(null);
  const inFlightRef = useRef(false);

  // Probes (rename-able per session; temps are hydrated from latest sample)
  const [probes, setProbes] = useState([
    { id: "probe1_temp", name: "Probe 1", minAlert: "", maxAlert: "", mobileNumber: "", itemType: "", itemWeight: "", temperature: null },
    { id: "probe2_temp", name: "Probe 2", minAlert: "", maxAlert: "", mobileNumber: "", itemType: "", itemWeight: "", temperature: null },
    { id: "probe3_temp", name: "Probe 3", minAlert: "", maxAlert: "", mobileNumber: "", itemType: "", itemWeight: "", temperature: null },
  ]);

  // Latest (newest-first by timestamp)
  const latest = useMemo(() => sensorData[0] || {}, [sensorData]);

  // “Smokehouse environment” derived from latest sample
  const smokehouseStatus = useMemo(() => {
    if (!latest) return {};
    return {
      outside: pickNum(latest.outside_temp, latest.internal_temp),
      top: pickNum(latest.top_temp),
      middle: pickNum(latest.middle_temp),
      bottom: pickNum(latest.bottom_temp),
      humidity: pickNum(latest.humidity),
      smokePPM: pickNum(latest.smoke_ppm),
    };
  }, [latest]);

  // --- helpers ---
  function pickNum(...vals) {
    for (const v of vals) {
      if (v === undefined || v === null) continue;
      if (typeof v === "number" && v === -999) continue;
      return v;
    }
    return null;
  }

  const resolveSessionId = useCallback(async () => {
    const res = await fetchLatestSession();
    return String(res.session_id || "");
  }, []);

  const refreshData = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    setError("");

    try {
      const sid = await resolveSessionId();
      if (!sid) throw new Error("No session_id returned");
      setSessionId(sid);

      const data = await fetchSensors(sid, 100);
      // Sort newest-first by ISO-ish timestamp
      const sorted = [...(Array.isArray(data) ? data : [])].sort((a, b) => {
        const ta = String(a?.timestamp ?? "");
        const tb = String(b?.timestamp ?? "");
        return tb.localeCompare(ta);
      });
      setSensorData(sorted);

      // Hydrate current probe temps from latest sample (if present)
      const latestSample = sorted[0] || {};
      setProbes((prev) =>
        prev.map((p) => ({
          ...p,
          temperature:
            latestSample[p.id] !== undefined && latestSample[p.id] !== -999
              ? latestSample[p.id]
              : null,
        }))
      );
    } catch (e) {
      setError("Failed to load session/sensor data");
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [resolveSessionId]);

  // Load item types once
  useEffect(() => {
    let mounted = true;
    fetchItemTypes()
      .then((types) => {
        if (!mounted) return;
        setItemTypes(Array.isArray(types) ? types : []);
      })
      .catch(() => {
        // non-fatal
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Polling for sensor data
  useEffect(() => {
    refreshData(); // immediate
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(refreshData, POLL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [refreshData]);

  // Alerts
  const onClearAlert = useCallback((probeId) => {
    setAlerts((prev) => prev.filter((a) => a.probeId !== probeId));
  }, []);

  const handleSetAlert = useCallback((id, min, max, mobileNumber) => {
    setAlerts((prev) => [
      ...prev,
      { probeId: id, min, max, probeName: nameForProbe(id), active: true, mobileNumber },
    ]);
  }, []);

  function nameForProbe(id) {
    const p = probes.find((x) => x.id === id);
    return p?.name || id;
  }

  // Assign / update item on probe
  const handleItemChange = useCallback(
    async (id, itemType, itemWeight) => {
      setProbes((prev) =>
        prev.map((probe) =>
          probe.id === id ? { ...probe, itemType, itemWeight } : probe
        )
      );
      try {
        await axios.post(probeAssignmentEndpoint, {
          probeId: id,
          itemType,
          itemWeight,
          sessionId, // current session
        });
      } catch (e) {
        // Non-fatal to UI; you’ll see in console for debugging
        // eslint-disable-next-line no-console
        console.error("Error saving probe assignment:", e?.message || e);
      }
    },
    [sessionId]
  );

  return (
    <div className="app-container">
      <header>
        <h1>SmokeGPT – AI Powered Smokehouse</h1>
        <div className="text-sm text-gray-600">
          Session: <code>{sessionId || "—"}</code>
          {loading && <span className="ml-2">Loading…</span>}
          {error && <span className="ml-2 text-red-600">{error}</span>}
        </div>
      </header>

      <section className="layout-container">
        <div className="left-column">
          {/* Environment status + chart */}
          <div
            className="smokehouse-status-container"
            style={{ display: "flex", alignItems: "flex-start", gap: 16 }}
          >
            <div className="probe-card" style={{ minWidth: 220 }}>
              <h3>Smokehouse Status</h3>
              <Row label="Outside Temp" value={valOrNA(smokehouseStatus.outside)} />
              <Row label="Top" value={valOrNA(smokehouseStatus.top)} />
              <Row label="Middle" value={valOrNA(smokehouseStatus.middle)} />
              <Row label="Bottom" value={valOrNA(smokehouseStatus.bottom)} />
              <Row label="Humidity (%)" value={valOrNA(smokehouseStatus.humidity)} />
              <Row label="Smoke (ppm)" value={valOrNA(smokehouseStatus.smokePPM)} />
            </div>

            <div className="smokehouse-chart-container" style={{ flex: 1 }}>
              {sensorData.length > 0 ? (
                <Chart data={sensorData} />
              ) : (
                <div className="text-sm text-gray-500">No samples yet.</div>
              )}
            </div>
          </div>

          {/* Probes */}
          {probes.map((probe) => (
            <div
              key={probe.id}
              className="probe-container"
              style={{ display: "flex", alignItems: "flex-start", gap: 12, marginTop: 16 }}
            >
              <ProbeCard
                probe={probe}
                onSetAlert={handleSetAlert}
                onMeatChange={(id, t, w) => handleItemChange(id, t, w)}
                meatTypes={itemTypes || []}
              />
              <div className="probe-chart-container" style={{ flex: 1 }}>
                <ProbeChart probe={probe} data={sensorData} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Alerts */}
      {alerts.length > 0 && <Alerts alerts={alerts} onClearAlert={onClearAlert} />}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <p>
      {label}: {valOrNA(value)}
    </p>
  );
}

function valOrNA(v) {
  if (v === undefined || v === null) return "N/A";
  if (typeof v === "number" && v === -999) return "N/A";
  return v;
}
