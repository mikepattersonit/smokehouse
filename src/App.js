// src/App.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import Chart from "./components/Chart/Chart";
import Alerts from "./components/Alerts/Alerts";
import ProbeCard from "./components/ProbeCard/ProbeCard";
import { fetchLatestSession, fetchSessions, fetchSensors, fetchItemTypes, updateSession } from "./api";
import SessionSelector from "./components/SessionSelector/SessionSelector";
import { sessionIdToDate } from "./components/SessionSelector/formatDateTime";
import { toDisplay, fromDisplay, unitLabel } from "./utils/temperature";
import axios from "axios";

const POLL_MS = 15000;

const PROBE_ASSIGNMENT_URL =
  "https://hgrhqnwar6.execute-api.us-east-2.amazonaws.com/ManageProbeAssignments";

function fmtElapsed(ms) {
  if (ms == null || ms < 0) return null;
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function App() {
  const [sessionId, setSessionId] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sensorData, setSensorData] = useState([]);
  const [itemTypes, setItemTypes] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [targetPitTempF, setTargetPitTempF] = useState(""); // always stored in °F
  const [mobileNumber, setMobileNumber] = useState("");
  const [unit, setUnit] = useState("F"); // 'F' | 'C'
  const [sessionElapsed, setSessionElapsed] = useState(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const timerRef = useRef(null);
  const clockRef = useRef(null);
  const inFlightRef = useRef(false);

  const [probes, setProbes] = useState([
    { id: "probe1_temp", name: "Probe 1", minAlert: "", maxAlert: "", itemType: "", itemWeight: "", temperature: null },
    { id: "probe2_temp", name: "Probe 2", minAlert: "", maxAlert: "", itemType: "", itemWeight: "", temperature: null },
    { id: "probe3_temp", name: "Probe 3", minAlert: "", maxAlert: "", itemType: "", itemWeight: "", temperature: null },
  ]);

  const latest = useMemo(() => sensorData[0] || {}, [sensorData]);

  const smokehouseStatus = useMemo(() => ({
    outside:  pickNum(latest.outside_temp, latest.internal_temp),
    top:      pickNum(latest.top_temp),
    middle:   pickNum(latest.middle_temp),
    bottom:   pickNum(latest.bottom_temp),
    humidity: pickNum(latest.humidity),
    smokePPM: pickNum(latest.smoke_ppm),
  }), [latest]);

  function pickNum(...vals) {
    for (const v of vals) {
      if (v === undefined || v === null) continue;
      if (typeof v === "number" && v === -999) continue;
      return v;
    }
    return null;
  }

  // isLive: viewing the latest session AND the smokehouse is actively sending data
  const isLive = (!selectedSessionId || selectedSessionId === sessionId) && sessionActive;

  useEffect(() => {
    if (!sessionId) return;
    const startDate = sessionIdToDate(sessionId);
    if (!startDate) return;

    function tick() {
      setSessionElapsed(Date.now() - startDate.getTime());
    }
    tick();
    clockRef.current = setInterval(tick, 60000);
    return () => clearInterval(clockRef.current);
  }, [sessionId]);

  const resolveSessionId = useCallback(async () => {
    const res = await fetchLatestSession();
    setSessionActive(res.status === "active");
    return String(res.session_id || "");
  }, []);

  useEffect(() => {
    let mounted = true;
    fetchSessions(50)
      .then((list) => { if (mounted) setSessions(Array.isArray(list) ? list : []); })
      .catch(() => {})
      .finally(() => { if (mounted) setSessionsLoading(false); });
    return () => { mounted = false; };
  }, []);

  const selectedSessionIdRef = useRef(selectedSessionId);
  useEffect(() => { selectedSessionIdRef.current = selectedSessionId; }, [selectedSessionId]);

  const refreshData = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    setError("");
    try {
      const sid = await resolveSessionId();
      if (!sid) throw new Error("No session_id returned");
      setSessionId(sid);
      setSelectedSessionId((prev) => prev || sid);

      const viewSid = selectedSessionIdRef.current || sid;
      const data = await fetchSensors(viewSid, 100);
      const sorted = [...(Array.isArray(data) ? data : [])].sort((a, b) =>
        String(b?.timestamp ?? "").localeCompare(String(a?.timestamp ?? ""))
      );
      setSensorData(sorted);

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
    } catch {
      setError("Failed to load data");
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [resolveSessionId]);

  useEffect(() => {
    let mounted = true;
    fetchItemTypes()
      .then((types) => { if (mounted) setItemTypes(Array.isArray(types) ? types : []); })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    refreshData();
    if (timerRef.current) clearInterval(timerRef.current);
    if (isLive) timerRef.current = setInterval(refreshData, POLL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [refreshData, isLive]);

  const handleSessionSelect = useCallback((sid) => setSelectedSessionId(sid), []);

  const handleApplyPitTemp = useCallback(async (tempF) => {
    setTargetPitTempF(String(tempF));
    try {
      await updateSession({ session_id: sessionId, target_pit_temp_f: tempF });
    } catch (e) {
      console.error("Failed to save target pit temp:", e); // eslint-disable-line no-console
    }
  }, [sessionId]);

  const onClearAlert = useCallback((probeId) => {
    setAlerts((prev) => prev.filter((a) => a.probeId !== probeId));
  }, []);

  const handleSetAlert = useCallback((id, minF, maxF) => {
    const current = probes.find((p) => p.id === id);
    const probeName = current?.name || id;
    setAlerts((prev) => [
      ...prev,
      { probeId: id, min: minF, max: maxF, probeName, active: true, mobileNumber },
    ]);
  }, [probes, mobileNumber]);

  const handleItemChange = useCallback(async (id, itemType, itemWeight) => {
    setProbes((prev) =>
      prev.map((p) => (p.id === id ? { ...p, itemType, itemWeight } : p))
    );
    try {
      await axios.post(PROBE_ASSIGNMENT_URL, { probeId: id, itemType, itemWeight, sessionId });
    } catch (e) {
      console.error("Error saving probe assignment:", e?.message || e); // eslint-disable-line no-console
    }
  }, [sessionId]);

  // Pit temp display value (convert F→display unit)
  const pitTempDisplay = targetPitTempF !== ""
    ? toDisplay(Number(targetPitTempF), unit) ?? ""
    : "";

  function tempClass(valF) {
    if (valF === null) return "na";
    if (valF >= 200) return "hot";
    if (valF >= 150) return "warm";
    return "";
  }

  function fmtStat(valF) {
    if (valF === null || valF === undefined) return "—";
    const v = toDisplay(valF, unit);
    return v == null ? "—" : String(v);
  }

  const ul = unitLabel(unit);

  return (
    <div>
      {/* HEADER */}
      <header className="app-header">
        <div className="header-top-row">
          <div className="header-left">
            <div className="app-logo">Smoke<span>GPT</span></div>
            {isLive ? (
              <div className="live-badge">
                <div className="live-dot" />
                Live
                {sessionElapsed != null && (
                  <span className="session-clock">{fmtElapsed(sessionElapsed)}</span>
                )}
              </div>
            ) : (
              <div className="historical-badge">Historical</div>
            )}
          </div>
          <div className="header-right">
            {loading && <span className="header-loading">Loading…</span>}
            {error   && <span className="header-error">{error}</span>}
            <button
              className={`unit-toggle${unit === "C" ? " unit-toggle--active" : ""}`}
              onClick={() => setUnit((u) => u === "F" ? "C" : "F")}
            >
              °{unit === "F" ? "C" : "F"}
            </button>
            <div className="mobile-field">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18"/>
              </svg>
              <input
                type="tel"
                placeholder="(555) 123-4567"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="header-session-row">
          <SessionSelector
            sessions={sessions}
            currentId={sessionId}
            selectedId={selectedSessionId || sessionId}
            onSelect={handleSessionSelect}
            loading={sessionsLoading}
          />
          {!isLive && (
            <button className="back-to-live-btn" onClick={() => setSelectedSessionId(sessionId)}>
              ← Live
            </button>
          )}
        </div>
      </header>

      {/* STATUS STRIP */}
      <div className="status-strip">
        {[
          { label: "Outside", val: smokehouseStatus.outside },
          { label: "Top",     val: smokehouseStatus.top },
          { label: "Middle",  val: smokehouseStatus.middle },
          { label: "Bottom",  val: smokehouseStatus.bottom },
        ].map(({ label, val }) => (
          <div className="stat-cell" key={label}>
            <span className="stat-label">{label}</span>
            <span className={`stat-value ${tempClass(val)}`}>{fmtStat(val)}</span>
            <span className="stat-unit">{ul}</span>
          </div>
        ))}
        <div className="stat-cell">
          <span className="stat-label">Humidity</span>
          <span className={`stat-value ${smokehouseStatus.humidity == null ? "na" : ""}`}>
            {smokehouseStatus.humidity != null ? smokehouseStatus.humidity : "—"}
          </span>
          <span className="stat-unit">%</span>
        </div>
        <div className="stat-cell">
          <span className="stat-label">Smoke</span>
          <span className={`stat-value ${smokehouseStatus.smokePPM == null ? "na" : ""}`}>
            {smokehouseStatus.smokePPM != null ? smokehouseStatus.smokePPM : "—"}
          </span>
          <span className="stat-unit">ppm</span>
        </div>
      </div>

      {/* PIT TEMP */}
      <div className="pit-temp-bar">
        <span>Target pit temp:</span>
        <input
          type="number"
          inputMode="numeric"
          min={unit === "C" ? "10" : "50"}
          max={unit === "C" ? "260" : "500"}
          value={pitTempDisplay}
          onChange={(e) => {
            const f = fromDisplay(e.target.value, unit);
            setTargetPitTempF(f != null ? String(f) : "");
          }}
          onBlur={() => {
            if (targetPitTempF && sessionId)
              updateSession({ session_id: sessionId, target_pit_temp_f: Number(targetPitTempF) }).catch(() => {});
          }}
          placeholder={unit === "C" ? "e.g. 107" : "e.g. 225"}
        />
        <span style={{ color: "var(--text3)" }}>{ul}</span>
      </div>

      {/* MAIN CHART */}
      <div className="main-chart-section">
        <div className="section-label">Smokehouse Temperature History</div>
        {sensorData.length > 0
          ? <Chart data={sensorData} sessionId={selectedSessionId || sessionId} unit={unit} />
          : <div style={{ color: "var(--text3)", fontSize: "0.85rem", padding: "20px 0" }}>No data yet.</div>
        }
        <div className="chart-legend">
          <div className="legend-item"><div className="legend-dot" style={{ background: "#60a5fa" }} /> Top</div>
          <div className="legend-item"><div className="legend-dot" style={{ background: "#34d399" }} /> Middle</div>
          <div className="legend-item"><div className="legend-dot" style={{ background: "#f59e0b" }} /> Bottom</div>
          <div className="legend-item"><div className="legend-dot" style={{ background: "#9ca3af" }} /> Outside</div>
        </div>
      </div>

      {/* PROBES */}
      <div className="probes-section">
        <div className="section-label">Probes</div>
        <div className="probes-grid">
          {probes.map((probe) => (
            <ProbeCard
              key={probe.id}
              probe={probe}
              data={sensorData}
              sessionId={selectedSessionId || sessionId}
              itemTypes={itemTypes || []}
              unit={unit}
              onSetAlert={handleSetAlert}
              onClearAlert={onClearAlert}
              onItemChange={handleItemChange}
              onApplyPitTemp={handleApplyPitTemp}
            />
          ))}
        </div>
      </div>

      {alerts.length > 0 && <Alerts alerts={alerts} onClearAlert={onClearAlert} />}
    </div>
  );
}
