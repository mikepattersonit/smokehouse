// src/App.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import Chart from "./components/Chart/Chart";
import Alerts from "./components/Alerts/Alerts";
import ProbeCard from "./components/ProbeCard/ProbeCard";
import { fetchLatestSession, fetchSessions, fetchSensors, fetchItemTypes, updateSession, fetchProbeAssignments, saveProbeAssignment, fetchAdvisorCache } from "./api";
import GroupedProbeCard from "./components/ProbeCard/GroupedProbeCard";
import ContactsModal from "./components/Contacts/ContactsModal";
import SessionSelector from "./components/SessionSelector/SessionSelector";
import { sessionIdToDate } from "./components/SessionSelector/formatDateTime";
import { toDisplay, fromDisplay, unitLabel } from "./utils/temperature";
const POLL_MS = 15000;

function fmtElapsed(ms) {
  if (ms == null || ms < 0) return null;
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Current UTC time in the same compact "YYYYMMDDTHHMMSSZ" format the
// sensor/firmware timestamps use, e.g. "20260712T211530Z".
function nowCompactUtc() {
  return new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

// Retries a failing save once before giving up, so a single transient
// network/cold-start blip doesn't silently drop a user's change.
async function withRetry(fn, retryDelayMs = 800) {
  try {
    return await fn();
  } catch (e) {
    await new Promise((r) => setTimeout(r, retryDelayMs));
    return fn();
  }
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
  const [unit, setUnit] = useState("F"); // 'F' | 'C'
  const [sessionElapsed, setSessionElapsed] = useState(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [contactsOpen, setContactsOpen] = useState(false);
  const timerRef = useRef(null);
  const clockRef = useRef(null);
  const inFlightRef = useRef(false);
  const pitTempLoadedForRef = useRef("");

  const [probes, setProbes] = useState([
    { id: "probe1_temp", name: "Probe 1", minAlert: "", maxAlert: "", itemType: "", itemWeight: "", temperature: null, groupId: null, insertedAt: null, aiAdvice: null, aiAdviceCached: false },
    { id: "probe2_temp", name: "Probe 2", minAlert: "", maxAlert: "", itemType: "", itemWeight: "", temperature: null, groupId: null, insertedAt: null, aiAdvice: null, aiAdviceCached: false },
    { id: "probe3_temp", name: "Probe 3", minAlert: "", maxAlert: "", itemType: "", itemWeight: "", temperature: null, groupId: null, insertedAt: null, aiAdvice: null, aiAdviceCached: false },
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

  // The session currently being viewed (historical or live) — every read AND
  // write (probe assignments, alerts, pit temp) must be scoped to this, not
  // the bare `sessionId`, which is always the live session.
  const viewSessionId = selectedSessionId || sessionId;

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
    return res;
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
      const session = await resolveSessionId();
      const sid = String(session.session_id || "");
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

      // Restore target pit temp saved by the backend — once per LIVE session.
      // fetchLatestSession() only ever returns the live session's own data, so
      // this can't be scoped to whichever historical session is being viewed.
      if (pitTempLoadedForRef.current !== sid) {
        pitTempLoadedForRef.current = sid;
        if (session.target_pit_temp_f != null) {
          setTargetPitTempF(String(session.target_pit_temp_f));
        }
      }

      // Restore probe assignments (item type, weight, alert thresholds, group)
      // for whichever session is currently being viewed. Re-fetched on every
      // poll (not just once per session view) so a change made from another
      // device shows up here within one poll interval — consistent with how
      // sensor data already refreshes.
      const assignments = await fetchProbeAssignments(viewSid);

      // Restore each assigned probe's last AI guidance the same way — a
      // read-only cache peek (never triggers a new Bedrock call) so the
      // last response shown stays visible across refreshes and devices
      // until someone clicks "Refresh AI" to rerun it.
      const activeAssignments = assignments.filter((a) => a.item_type);
      const adviceResults = await Promise.all(
        activeAssignments.map((a) => fetchAdvisorCache(viewSid, a.probe_id))
      );
      const adviceByProbe = {};
      activeAssignments.forEach((a, i) => {
        const res = adviceResults[i];
        if (res?.advice) adviceByProbe[a.probe_id] = { advice: res.advice, cached: !!res.cached };
      });

      setProbes((prev) =>
        prev.map((p) => {
          const a = assignments.find((x) => x.probe_id === p.id);
          const adv = adviceByProbe[p.id];
          // No `if (!a) return p` fallback here on purpose: a probe with no
          // assignment in the viewed session must reset to blank, not keep
          // whatever was displayed for the previously-viewed session.
          return {
            ...p,
            itemType:   a?.item_type   ?? "",
            itemWeight: a?.item_weight ?? "",
            minAlert:   a?.min_alert  != null ? String(a.min_alert) : "",
            maxAlert:   a?.max_alert  != null ? String(a.max_alert) : "",
            groupId:    a?.group_id   ?? null,
            insertedAt: a?.inserted_at ?? null,
            aiAdvice:       adv ? adv.advice : null,
            aiAdviceCached: adv ? adv.cached : false,
          };
        })
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

  const handleSessionSelect = useCallback((sid) => {
    selectedSessionIdRef.current = sid;
    setSelectedSessionId(sid);
    refreshData();
  }, [refreshData]);

  const handleApplyPitTemp = useCallback(async (tempF) => {
    setTargetPitTempF(String(tempF));
    try {
      await withRetry(() => updateSession({ session_id: viewSessionId, target_pit_temp_f: tempF }));
    } catch (e) {
      console.error("Failed to save target pit temp:", e); // eslint-disable-line no-console
      setError("Failed to save target pit temp — please try again.");
    }
  }, [viewSessionId]);

  const onClearAlert = useCallback((probeId) => {
    setAlerts((prev) => prev.filter((a) => a.probeId !== probeId));
  }, []);

  const handleSetAlert = useCallback((id, minF, maxF) => {
    const current = probes.find((p) => p.id === id);
    const probeName = current?.name || id;
    setAlerts((prev) => [
      ...prev,
      { probeId: id, min: minF, max: maxF, probeName, active: true },
    ]);
  }, [probes]);

  const handleItemChange = useCallback(async (id, itemType, itemWeight) => {
    setProbes((prev) => {
      const probe = prev.find((p) => p.id === id);
      const groupIds = probe?.groupId
        ? prev.filter((p) => p.groupId === probe.groupId).map((p) => p.id)
        : [id];
      return prev.map((p) => groupIds.includes(p.id) ? { ...p, itemType, itemWeight } : p);
    });
    try {
      // Save to all probes in the same group (shared item)
      const probe = probes.find((p) => p.id === id);
      const groupProbes = probe?.groupId
        ? probes.filter((p) => p.groupId === probe.groupId)
        : [probe];
      await withRetry(() => Promise.all(
        groupProbes.map((p) =>
          saveProbeAssignment({
            sessionId: viewSessionId, probeId: p.id, itemType, itemWeight,
            minAlert: p.minAlert || null, maxAlert: p.maxAlert || null,
            groupId: probe.groupId || null, insertedAt: p.insertedAt || null,
          })
        )
      ));
    } catch (e) {
      console.error("Error saving probe assignment:", e?.message || e); // eslint-disable-line no-console
      setError("Failed to save item assignment — please try again.");
    }
  }, [probes, viewSessionId]);

  const handleLinkProbe = useCallback(async (myId, partnerId) => {
    const groupId = myId;
    const myProbe = probes.find((p) => p.id === myId);
    const partnerProbe = probes.find((p) => p.id === partnerId);
    const sharedItemType = myProbe?.itemType || partnerProbe?.itemType || "";
    const sharedItemWeight = myProbe?.itemWeight || partnerProbe?.itemWeight || "";

    setProbes((prev) =>
      prev.map((p) =>
        p.id === myId || p.id === partnerId
          ? { ...p, groupId, itemType: sharedItemType, itemWeight: sharedItemWeight }
          : p
      )
    );
    try {
      await withRetry(() => Promise.all([
        saveProbeAssignment({ sessionId: viewSessionId, probeId: myId, itemType: sharedItemType, itemWeight: sharedItemWeight, minAlert: myProbe?.minAlert || null, maxAlert: myProbe?.maxAlert || null, groupId, insertedAt: myProbe?.insertedAt || null }),
        saveProbeAssignment({ sessionId: viewSessionId, probeId: partnerId, itemType: sharedItemType, itemWeight: sharedItemWeight, minAlert: partnerProbe?.minAlert || null, maxAlert: partnerProbe?.maxAlert || null, groupId, insertedAt: partnerProbe?.insertedAt || null }),
      ]));
    } catch (e) {
      console.error("Error linking probes:", e?.message || e); // eslint-disable-line no-console
      setError("Failed to link probes — please try again.");
    }
  }, [probes, viewSessionId]);

  const handleUnlinkProbe = useCallback(async (groupId) => {
    const groupProbes = probes.filter((p) => p.groupId === groupId);
    setProbes((prev) => prev.map((p) => p.groupId === groupId ? { ...p, groupId: null } : p));
    try {
      await withRetry(() => Promise.all(
        groupProbes.map((p) =>
          saveProbeAssignment({ sessionId: viewSessionId, probeId: p.id, itemType: p.itemType, itemWeight: p.itemWeight, minAlert: p.minAlert || null, maxAlert: p.maxAlert || null, groupId: null, insertedAt: p.insertedAt || null })
        )
      ));
    } catch (e) {
      console.error("Error unlinking probes:", e?.message || e); // eslint-disable-line no-console
      setError("Failed to unlink probes — please try again.");
    }
  }, [probes, viewSessionId]);

  // Records the moment a probe actually goes into the meat, separate from
  // session start — the advisor uses this instead of session-start elapsed
  // time so warmup-in-ambient-pit-air readings don't get read as "the cook."
  const handleMarkInserted = useCallback(async (id) => {
    const insertedAt = nowCompactUtc();
    setProbes((prev) => prev.map((p) => p.id === id ? { ...p, insertedAt } : p));
    try {
      const probe = probes.find((p) => p.id === id);
      await withRetry(() => saveProbeAssignment({
        sessionId: viewSessionId, probeId: id,
        itemType: probe?.itemType, itemWeight: probe?.itemWeight,
        minAlert: probe?.minAlert || null, maxAlert: probe?.maxAlert || null,
        groupId: probe?.groupId || null, insertedAt,
      }));
    } catch (e) {
      console.error("Error marking probe inserted:", e?.message || e); // eslint-disable-line no-console
      setError("Failed to mark probe as inserted — please try again.");
    }
  }, [probes, viewSessionId]);

  // Called by a probe card right after a fresh "AI Guidance" / "Refresh AI"
  // response comes back, so it's reflected immediately instead of waiting
  // for the next poll.
  const handleAdviceUpdate = useCallback((probeId, advice, cached) => {
    setProbes((prev) =>
      prev.map((p) => p.id === probeId ? { ...p, aiAdvice: advice, aiAdviceCached: cached } : p)
    );
  }, []);

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
            <button className="unit-toggle" onClick={() => setContactsOpen(true)}>
              🔔 Alerts
            </button>
            <button
              className={`unit-toggle${unit === "C" ? " unit-toggle--active" : ""}`}
              onClick={() => setUnit((u) => u === "F" ? "C" : "F")}
            >
              °{unit === "F" ? "C" : "F"}
            </button>
          </div>
        </div>
        <div className="header-session-row">
          <SessionSelector
            sessions={sessions}
            currentId={sessionId}
            selectedId={viewSessionId}
            onSelect={handleSessionSelect}
            loading={sessionsLoading}
            sessionActive={sessionActive}
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
            {smokehouseStatus.humidity != null ? Math.round(smokehouseStatus.humidity) : "—"}
          </span>
          <span className="stat-unit">%</span>
        </div>
        <div className="stat-cell">
          <span className="stat-label">Smoke</span>
          <span className={`stat-value ${smokehouseStatus.smokePPM == null ? "na" : ""}`}>
            {smokehouseStatus.smokePPM != null ? Math.round(smokehouseStatus.smokePPM) : "—"}
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
            if (targetPitTempF && viewSessionId) {
              withRetry(() => updateSession({ session_id: viewSessionId, target_pit_temp_f: Number(targetPitTempF) }))
                .catch(() => setError("Failed to save target pit temp — please try again."));
            }
          }}
          placeholder={unit === "C" ? "e.g. 107" : "e.g. 225"}
        />
        <span style={{ color: "var(--text3)" }}>{ul}</span>
      </div>

      {/* MAIN CHART */}
      <div className="main-chart-section">
        <div className="section-label">Smokehouse Temperature History</div>
        {sensorData.length > 0
          ? <Chart data={sensorData} sessionId={viewSessionId} unit={unit} />
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
          {(() => {
            const seen = new Set();
            return probes.flatMap((probe) => {
              if (seen.has(probe.id)) return [];
              seen.add(probe.id);

              if (probe.groupId) {
                const partners = probes.filter(
                  (p) => !seen.has(p.id) && p.groupId === probe.groupId
                );
                partners.forEach((p) => seen.add(p.id));
                const group = [probe, ...partners];
                return [(
                  <GroupedProbeCard
                    key={group.map((p) => p.id).join("+")}
                    probes={group}
                    data={sensorData}
                    sessionId={viewSessionId}
                    itemTypes={itemTypes || []}
                    unit={unit}
                    onSetAlert={handleSetAlert}
                    onClearAlert={onClearAlert}
                    onItemChange={handleItemChange}
                    onUngroup={handleUnlinkProbe}
                    onApplyPitTemp={handleApplyPitTemp}
                    onMarkInserted={handleMarkInserted}
                    onAdviceUpdate={handleAdviceUpdate}
                  />
                )];
              }

              const availablePartners = probes.filter(
                (p) => !p.groupId && p.id !== probe.id
              );
              return [(
                <ProbeCard
                  key={probe.id}
                  probe={probe}
                  data={sensorData}
                  sessionId={viewSessionId}
                  itemTypes={itemTypes || []}
                  unit={unit}
                  onSetAlert={handleSetAlert}
                  onClearAlert={onClearAlert}
                  onItemChange={handleItemChange}
                  onApplyPitTemp={handleApplyPitTemp}
                  availablePartners={availablePartners}
                  onGroupWith={handleLinkProbe}
                  onMarkInserted={handleMarkInserted}
                  onAdviceUpdate={handleAdviceUpdate}
                />
              )];
            });
          })()}
        </div>
      </div>

      {alerts.length > 0 && <Alerts alerts={alerts} onClearAlert={onClearAlert} />}

      {contactsOpen && <ContactsModal onClose={() => setContactsOpen(false)} />}
    </div>
  );
}
