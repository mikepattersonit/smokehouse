const SENSORS_BASE = process.env.REACT_APP_SENSORS_BASE_URL;
const DEFAULT_SESSION_ID = process.env.REACT_APP_DEFAULT_SESSION_ID || "";

export async function fetchSensors(sessionId = DEFAULT_SESSION_ID, limit = 50) {
  if (!SENSORS_BASE) throw new Error("REACT_APP_SENSORS_BASE_URL is not set");
  const sid = (sessionId || "").toString().trim();
  if (!sid) throw new Error("session_id is empty");
  const url = `${SENSORS_BASE}/sensors?session_id=${encodeURIComponent(sid)}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${url} -> ${res.status}: ${text}`);
  }
  return res.json();
}
