import React, { useEffect, useState } from "react";
import { fetchSensors } from "../api";

export default function LiveSensors() {
  const [sessionId] = useState(process.env.REACT_APP_DEFAULT_SESSION_ID || "");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let timer;
    async function load() {
      try {
        const data = await fetchSensors(sessionId, 50);
        setRows(Array.isArray(data) ? data : []);
        setError("");
      } catch (e) {
        setError(e.message || String(e));
      }
    }
    load();
    timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [sessionId]);

  const cols = rows.length ? Object.keys(rows[0]) : [];
  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ margin: 0, marginBottom: 8 }}>
        Live Sensors <small style={{ fontWeight: "normal" }}>(session {sessionId})</small>
      </h2>
      {error && <div style={{ color: "red", marginBottom: 8 }}>{error}</div>}
      {!rows.length ? (
        <div>No data yet.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 600 }}>
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c} style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "6px 8px" }}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {cols.map((c) => (
                    <td key={c} style={{ borderBottom: "1px solid #f0f0f0", padding: "6px 8px" }}>
                      {String(r[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
